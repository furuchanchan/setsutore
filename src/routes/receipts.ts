import { Hono } from "hono";
import { z } from "zod";
import { callTool, readUploadedImage, reserveAiCall, toBase64 } from "../ai";
import { HttpError } from "../errors";
import { promoteDraft } from "../photos";
import type { AppEnv } from "../env";
import { PantryState, applyPurchase, loadPantry, pantryStatements } from "../pantry";
import { MONTH_RE, jstDay, jstMonth } from "../time";
import { daySchema, receiptItemSchema, receiptSaveSchema } from "../schemas";
import { readJson } from "../validate";

const scanResultSchema = z.object({
  store: z.string().trim().min(1).max(100).describe("店名"),
  purchased_at: daySchema.describe("購入日 YYYY-MM-DD"),
  total_yen: z.number().int().min(0).describe("合計金額（税込・円）"),
  items: z.array(receiptItemSchema).max(200),
});

const SCAN_SYSTEM = `あなたは日本のスーパー・コンビニのレシートを読み取る係です。
写真から店名・購入日・合計金額・品目を読み取り、record_receipt ツールで返してください。
- printed_name はレシートに印字された略称そのまま。
- food_name は一般的な食材名に直す（例「国産若鶏ムネ」→「鶏むね肉」、「ｷｬﾍﾞﾂ」→「キャベツ」）。食材でない品目（袋・日用品など）は印字名に近い名前のままでよい。
- category は protein（肉・魚・卵・豆腐・乳製品など）/ vegetable / staple（米・パン・麺）/ seasoning（調味料・油・だし）/ snack / drink / other から選ぶ。
- quantity と unit は買った量（個・パック・g・ml・本など）。分からなければ 1 と「個」。
- price_yen はその品目の税込金額。値引きがあれば反映した金額にする。
- 読めない項目を創作しない。購入日が読めないときは、ユーザーが伝える今日の日付を使う。`;

export const receiptRoutes = new Hono<AppEnv>();

receiptRoutes.post("/receipts/scan", async (c) => {
  const { bytes, mediaType } = await readUploadedImage(c.req.raw);
  const now = new Date();
  await reserveAiCall(c.env, now);
  const draft = await callTool(c.env, {
    system: SCAN_SYSTEM,
    text: `このレシートを読み取ってください。今日の日付は ${jstDay(now)} です。`,
    images: [{ mediaType, base64: toBase64(bytes) }],
    toolName: "record_receipt",
    toolDescription: "レシートの読み取り結果を記録する",
    schema: scanResultSchema,
    maxTokens: 4096,
  });
  const imageKey = `drafts/${crypto.randomUUID()}`;
  await c.env.PHOTOS.put(imageKey, bytes, { httpMetadata: { contentType: mediaType } });
  return c.json({ image_key: imageKey, ...draft });
});

receiptRoutes.post("/receipts", async (c) => {
  const r = await readJson(c, receiptSaveSchema);
  const imageKey = r.image_key ? await promoteDraft(c.env.PHOTOS, r.image_key, "receipts") : null;
  const nowIso = new Date().toISOString();
  const receiptId = crypto.randomUUID();
  const db = c.env.DB;

  const state = new PantryState(await loadPantry(db));
  for (const it of r.items) {
    if (it.add_to_pantry) applyPurchase(state, it, nowIso);
  }

  await db.batch([
    db
      .prepare("INSERT INTO receipts (id, store, purchased_at, total_yen, image_key, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(receiptId, r.store, r.purchased_at, r.total_yen, imageKey, nowIso),
    ...r.items.map((it) =>
      db
        .prepare(
          "INSERT INTO receipt_items (id, receipt_id, printed_name, food_name, category, quantity, unit, price_yen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), receiptId, it.printed_name, it.food_name, it.category, it.quantity, it.unit, it.price_yen),
    ),
    ...pantryStatements(db, state),
  ]);
  if (r.image_key) await c.env.PHOTOS.delete(r.image_key);
  return c.json({ id: receiptId, image_key: imageKey, pantry: await loadPantry(db) }, 201);
});

receiptRoutes.get("/receipts", async (c) => {
  const month = c.req.query("month") ?? jstMonth(new Date());
  if (!MONTH_RE.test(month)) throw new HttpError(400, "month は YYYY-MM で指定してください");
  const db = c.env.DB;
  const [receipts, items] = await Promise.all([
    db
      .prepare("SELECT * FROM receipts WHERE substr(purchased_at, 1, 7) = ? ORDER BY purchased_at DESC, created_at DESC")
      .bind(month)
      .all<{ id: string; total_yen: number }>(),
    db
      .prepare(
        `SELECT i.* FROM receipt_items i JOIN receipts r ON r.id = i.receipt_id
         WHERE substr(r.purchased_at, 1, 7) = ? ORDER BY i.rowid`,
      )
      .bind(month)
      .all<{ receipt_id: string }>(),
  ]);
  const byReceipt = new Map<string, unknown[]>();
  for (const it of items.results) {
    const list = byReceipt.get(it.receipt_id) ?? [];
    list.push(it);
    byReceipt.set(it.receipt_id, list);
  }
  return c.json({
    month,
    total_yen: receipts.results.reduce((s, r) => s + r.total_yen, 0),
    receipts: receipts.results.map((r) => ({ ...r, items: byReceipt.get(r.id) ?? [] })),
  });
});

receiptRoutes.delete("/receipts/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT image_key FROM receipts WHERE id = ?").bind(id).first<{ image_key: string | null }>();
  if (!row) throw new HttpError(404, "そのレシートはありません");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM receipt_items WHERE receipt_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM receipts WHERE id = ?").bind(id),
  ]);
  if (row.image_key) await c.env.PHOTOS.delete(row.image_key);
  return c.json({ ok: true });
});
