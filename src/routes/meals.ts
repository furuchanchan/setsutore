import { Hono } from "hono";
import { z } from "zod";
import { callTool, readUploadedImage, reserveAiCall, toBase64 } from "../ai";
import { HttpError } from "../errors";
import type { AppEnv } from "../env";
import { loadPantry } from "../pantry";
import { daySchema, mealSaveSchema } from "../schemas";
import { jstDateTime, jstDay } from "../time";
import { parseInput, readJson } from "../validate";

const mealScanSchema = z.object({
  title: z.string().trim().min(1).max(100).describe("料理名"),
  kcal: z.number().int().min(0).max(20000).describe("全体のカロリーの目安（kcal）"),
  protein_g: z.number().min(0).max(2000),
  fat_g: z.number().min(0).max(2000),
  carbs_g: z.number().min(0).max(5000),
  ingredients: z
    .array(
      z.object({
        name: z.string().describe("使った食材。在庫一覧にある名前と完全に同じ表記で書く"),
        quantity: z.number().positive().optional().describe("使った量。在庫の単位に合わせる"),
      }),
    )
    .max(30)
    .describe("この料理に使ったと思われる、在庫にある食材だけ"),
});

const SCAN_SYSTEM = `あなたは食事の写真から栄養の目安を出す係です。
写真の料理を見て、record_meal ツールで料理名・カロリー・タンパク質・脂質・炭水化物（1食分の目安）を返してください。
- 見た目から分かる範囲の目安でよい。断定せず、量が分からないときは一般的な1人前で見積もる。
- ingredients には、ユーザーが伝える「今の在庫」の中で、この料理に使ったと思われるものだけを、在庫の名前と同じ表記で入れる。在庫に無いものは入れない。
- 料理が写っていないときも、最も近いと思われる内容で返し、title にその旨を書く。`;

export const mealRoutes = new Hono<AppEnv>();

mealRoutes.post("/meals/scan", async (c) => {
  const { bytes, mediaType } = await readUploadedImage(c.req.raw);
  const now = new Date();
  await reserveAiCall(c.env, now);
  const pantry = await loadPantry(c.env.DB);
  const stock = pantry.length
    ? pantry.map((p) => `- ${p.name}${p.quantity !== null ? `（${p.quantity}${p.unit ?? ""}）` : ""}`).join("\n")
    : "（在庫は空です）";
  const out = await callTool(c.env, {
    system: SCAN_SYSTEM,
    text: `この食事を読み取ってください。\n今の在庫:\n${stock}`,
    images: [{ mediaType, base64: toBase64(bytes) }],
    toolName: "record_meal",
    toolDescription: "食事の栄養の目安と使った食材を記録する",
    schema: mealScanSchema,
    maxTokens: 2048,
  });
  const byName = new Map(pantry.map((p) => [p.name, p]));
  const ingredients = out.ingredients.flatMap((ing) => {
    const item = byName.get(ing.name.normalize("NFKC").trim());
    // 数量を持たない在庫（調味料の level 管理）は減らす対象にしない
    if (!item || item.quantity === null) return [];
    return [{ pantry_item_id: item.id, name: item.name, quantity: ing.quantity ?? 1, unit: item.unit }];
  });
  const imageKey = `meals/${crypto.randomUUID()}`;
  await c.env.PHOTOS.put(imageKey, bytes, { httpMetadata: { contentType: mediaType } });
  return c.json({
    image_key: imageKey,
    title: out.title,
    kcal: out.kcal,
    protein_g: out.protein_g,
    fat_g: out.fat_g,
    carbs_g: out.carbs_g,
    ingredients,
  });
});

mealRoutes.post("/meals", async (c) => {
  const m = await readJson(c, mealSaveSchema);
  const db = c.env.DB;
  if (m.image_key && !(await c.env.PHOTOS.head(m.image_key))) {
    throw new HttpError(400, "image_key の画像が見つかりません");
  }
  const ids = [...new Set(m.consume.map((x) => x.pantry_item_id))];
  if (ids.length > 0) {
    const { results } = await db
      .prepare(`SELECT id FROM pantry_items WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all<{ id: string }>();
    const found = new Set(results.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) throw new HttpError(400, `consume の在庫が見つかりません: ${missing.join(", ")}`);
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();
  const eatenAt = m.eaten_at ? (m.eaten_at.length === 10 ? `${m.eaten_at}T12:00` : m.eaten_at) : jstDateTime(now);
  await db.batch([
    db
      .prepare(
        "INSERT INTO meals (id, eaten_at, image_key, title, kcal, protein_g, fat_g, carbs_g, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(id, eatenAt, m.image_key ?? null, m.title, m.kcal, m.protein_g, m.fat_g, m.carbs_g, m.note ?? null, nowIso),
    ...m.consume.map((x) =>
      db
        .prepare("UPDATE pantry_items SET quantity = MAX(0, quantity - ?), updated_at = ? WHERE id = ? AND quantity IS NOT NULL")
        .bind(x.quantity, nowIso, x.pantry_item_id),
    ),
  ]);
  return c.json({ id, eaten_at: eatenAt, pantry: await loadPantry(db) }, 201);
});

mealRoutes.get("/meals", async (c) => {
  const date = parseInput(daySchema, c.req.query("date") ?? jstDay(new Date()));
  const { results } = await c.env.DB.prepare("SELECT * FROM meals WHERE substr(eaten_at, 1, 10) = ? ORDER BY eaten_at")
    .bind(date)
    .all();
  return c.json({ date, meals: results });
});

mealRoutes.delete("/meals/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT image_key FROM meals WHERE id = ?").bind(id).first<{ image_key: string | null }>();
  if (!row) throw new HttpError(404, "その食事の記録はありません");
  await c.env.DB.prepare("DELETE FROM meals WHERE id = ?").bind(id).run();
  if (row.image_key) await c.env.PHOTOS.delete(row.image_key);
  return c.json({ ok: true });
});
