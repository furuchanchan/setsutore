import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSummary } from "../src/routes/summary";
import { call, imageForm, json, login, mockAnthropic, PNG } from "./helpers";

afterEach(() => vi.restoreAllMocks());

type Pantry = { id: string; name: string; quantity: number | null; unit: string | null; level: string | null; kind: string };
const pantryOf = async (cookie: string) => ((await (await call("/api/pantry", {}, cookie)).json()) as { pantry: Pantry[] }).pantry;
const find = (p: Pantry[], name: string) => p.find((x) => x.name === name);

describe("会話 /api/talk", () => {
  it("ops を在庫と筋トレへまとめて反映し、会話を保存する", async () => {
    const cookie = await login();
    await call("/api/pantry", json({ name: "卵", kind: "food", category: "protein", quantity: 5, unit: "個" }), cookie);
    await call("/api/pantry", json({ name: "醤油", kind: "seasoning", category: "seasoning" }), cookie);
    const m = mockAnthropic({
      reply: "卵は3個ですね。醤油は近いうちに買い足しましょう。",
      ops: [
        { op: "set_pantry", name: "卵", kind: "food", category: "protein", quantity: 3, unit: "個" },
        { op: "set_pantry", name: "醤油", kind: "seasoning", category: "seasoning", level: "low" },
        { op: "log_workout", exercise: "ベンチプレス", weight_kg: 60, reps: 8, sets: 3 },
      ],
    });
    const res = await call("/api/talk", json({ text: "卵あと3個、醤油もうすぐ切れそう。ベンチ60kgを8回3セットやった" }), cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string; changes: { op: string; name: string; before: unknown; after: unknown }[]; pantry: Pantry[] };
    expect(body.reply).toContain("卵");
    expect(body.changes.map((c) => c.op)).toEqual(["set_pantry", "set_pantry", "log_workout"]);
    expect(body.changes[0]).toMatchObject({ before: { quantity: 5 }, after: { quantity: 3 } });
    expect(find(body.pantry, "卵")!.quantity).toBe(3);
    expect(find(body.pantry, "醤油")!.level).toBe("low");

    const w = await env.DB.prepare("SELECT exercise, weight_kg, reps, sets FROM workouts").all();
    expect(w.results).toEqual([{ exercise: "ベンチプレス", weight_kg: 60, reps: 8, sets: 3 }]);
    const chat = await env.DB.prepare("SELECT role FROM chat_messages ORDER BY id").all<{ role: string }>();
    expect(chat.results.map((r) => r.role)).toEqual(["user", "assistant"]);

    // AI への要求の形：モデル、tool の強制、禁止パラメータを送らない
    const req = m.requests[0]!;
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.tool_choice).toEqual({ type: "tool", name: "apply" });
    for (const k of ["temperature", "top_p", "top_k"]) expect(req).not.toHaveProperty(k);
    expect(JSON.stringify(req.messages)).toContain("卵");
  });

  it("2回目の会話には直近の履歴が付く", async () => {
    const cookie = await login();
    mockAnthropic({ reply: "はい", ops: [] });
    await call("/api/talk", json({ text: "ひとこと目" }), cookie);
    const m = mockAnthropic({ reply: "はい", ops: [] });
    await call("/api/talk", json({ text: "ふたこと目" }), cookie);
    const msgs = m.requests[0]!.messages;
    expect(msgs.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
  });

  it("AI の応答が想定外なら 502、入力が空なら 400", async () => {
    const cookie = await login();
    mockAnthropic({ reply: "x", ops: [{ op: "unknown" }] });
    expect((await call("/api/talk", json({ text: "あ" }), cookie)).status).toBe(502);
    expect((await call("/api/talk", json({ text: "  " }), cookie)).status).toBe(400);
  });
});

describe("レシート", () => {
  it("スキャンは下書きを返し、R2 に保存し、まだ DB へは保存しない", async () => {
    const cookie = await login();
    const draft = {
      store: "スーパーA",
      purchased_at: "2026-10-14",
      total_yen: 1280,
      items: [{ printed_name: "国産若鶏ムネ", food_name: "鶏むね肉", category: "protein", quantity: 600, unit: "g", price_yen: 498 }],
    };
    const m = mockAnthropic(draft);
    const res = await call("/api/receipts/scan", imageForm(), cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof draft & { image_key: string };
    expect(body.image_key).toMatch(/^drafts\/[0-9a-f-]{36}$/);
    expect(body.items[0]!.food_name).toBe("鶏むね肉");
    expect(await env.PHOTOS.head(body.image_key)).not.toBeNull();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM receipts").first<{ n: number }>())!.n).toBe(0);
    expect(JSON.stringify(m.requests[0]!.messages)).toContain('"type":"image"');
    // 写真の配信（認証必須）
    expect((await call(`/api/photos/${body.image_key}`)).status).toBe(401);
    const photo = await call(`/api/photos/${body.image_key}`, {}, cookie);
    expect(photo.status).toBe(200);
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(PNG);
  });

  it("画像の検証：形式・大きさ", async () => {
    const cookie = await login();
    mockAnthropic({});
    expect((await call("/api/receipts/scan", imageForm(new Uint8Array([1, 2, 3, 4]), "image/png"), cookie)).status).toBe(400);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await call("/api/receipts/scan", imageForm(big), cookie)).status).toBe(413);
    expect((await call("/api/receipts/scan", { method: "POST", body: new FormData() }, cookie)).status).toBe(400);
  });

  it("保存すると、add_to_pantry の品目だけ在庫へ足す。削除で画像も消える", async () => {
    const cookie = await login();
    await call("/api/pantry", json({ name: "卵", kind: "food", category: "protein", quantity: 4, unit: "個" }), cookie);
    await call("/api/pantry", json({ name: "醤油", kind: "seasoning", category: "seasoning", level: "out" }), cookie);
    const draftKey = "drafts/00000000-0000-0000-0000-000000000001";
    await env.PHOTOS.put(draftKey, PNG, { httpMetadata: { contentType: "image/png" } });
    const item = (food_name: string, category: string, quantity: number, unit: string, add: boolean) => ({
      printed_name: food_name, food_name, category, quantity, unit, price_yen: 100, add_to_pantry: add,
    });
    const res = await call(
      "/api/receipts",
      json({
        image_key: draftKey,
        store: "スーパーA",
        purchased_at: "2026-10-14",
        total_yen: 800,
        items: [item("卵", "protein", 6, "個", true), item("醤油", "seasoning", 1, "本", true), item("ポテチ", "snack", 1, "袋", false), item("ブロッコリー", "vegetable", 2, "個", true)],
      }),
      cookie,
    );
    expect(res.status).toBe(201);
    const { id, pantry, image_key } = (await res.json()) as { id: string; pantry: Pantry[]; image_key: string };
    expect(image_key).toBe("receipts/00000000-0000-0000-0000-000000000001");
    expect(await env.PHOTOS.head(draftKey)).toBeNull();
    expect((await env.PHOTOS.head(image_key))?.httpMetadata?.contentType).toBe("image/png");
    expect(find(pantry, "卵")!.quantity).toBe(10);
    expect(find(pantry, "醤油")!.level).toBe("full");
    expect(find(pantry, "ブロッコリー")!.quantity).toBe(2);
    expect(find(pantry, "ポテチ")).toBeUndefined();

    const list = (await (await call("/api/receipts?month=2026-10", {}, cookie)).json()) as { total_yen: number; receipts: { items: unknown[] }[] };
    expect(list.total_yen).toBe(800);
    expect(list.receipts[0]!.items).toHaveLength(4);
    expect((await call("/api/receipts?month=2026-9", {}, cookie)).status).toBe(400);

    expect((await call(`/api/receipts/${id}`, { method: "DELETE" }, cookie)).status).toBe(200);
    expect(await env.PHOTOS.head(image_key)).toBeNull();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM receipt_items").first<{ n: number }>())!.n).toBe(0);
    expect((await call(`/api/receipts/${id}`, { method: "DELETE" }, cookie)).status).toBe(404);
  });

  it("drafts/ 以外・存在しない鍵は 400 で何も保存しない", async () => {
    const cookie = await login();
    await env.PHOTOS.put("receipts/00000000-0000-0000-0000-000000000009", PNG);
    const body = (image_key: string) => json({ image_key, store: "A", purchased_at: "2026-10-14", total_yen: 1, items: [] });
    expect((await call("/api/receipts", body("receipts/00000000-0000-0000-0000-000000000009"), cookie)).status).toBe(400);
    expect((await call("/api/receipts", body("drafts/00000000-0000-0000-0000-00000000000a"), cookie)).status).toBe(400);
    expect((await call("/api/receipts", body("../etc"), cookie)).status).toBe(400);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM receipts").first<{ n: number }>())!.n).toBe(0);
  });

  it("不正な入力は 400", async () => {
    const cookie = await login();
    const res = await call("/api/receipts", json({ store: "A", purchased_at: "2026-02-30", total_yen: 1, items: [] }), cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("purchased_at");
  });
});

describe("食事", () => {
  it("保存すると在庫が減り、0 未満にならない。数量の無い在庫は変えない", async () => {
    const cookie = await login();
    const mk = async (b: object) => ((await (await call("/api/pantry", json(b), cookie)).json()) as Pantry).id;
    const egg = await mk({ name: "卵", kind: "food", category: "protein", quantity: 2, unit: "個" });
    const rice = await mk({ name: "米", kind: "food", category: "staple", quantity: 300, unit: "g" });
    const soy = await mk({ name: "醤油", kind: "seasoning", category: "seasoning" });
    const res = await call(
      "/api/meals",
      json({
        eaten_at: "2026-10-15",
        title: "卵かけご飯",
        kcal: 450,
        protein_g: 15,
        fat_g: 10,
        carbs_g: 70,
        consume: [
          { pantry_item_id: egg, quantity: 3 },
          { pantry_item_id: rice, quantity: 150 },
          { pantry_item_id: soy, quantity: 1 },
        ],
      }),
      cookie,
    );
    expect(res.status).toBe(201);
    const { pantry, eaten_at } = (await res.json()) as { pantry: Pantry[]; eaten_at: string };
    expect(eaten_at).toBe("2026-10-15T12:00");
    expect(find(pantry, "卵")!.quantity).toBe(0);
    expect(find(pantry, "米")!.quantity).toBe(150);
    expect(find(pantry, "醤油")!.quantity).toBeNull();
    const meals = (await (await call("/api/meals?date=2026-10-15", {}, cookie)).json()) as { meals: { id: string }[] };
    expect(meals.meals).toHaveLength(1);
    expect((await call(`/api/meals/${meals.meals[0]!.id}`, { method: "DELETE" }, cookie)).status).toBe(200);
  });

  it("食事の保存で下書き画像が meals/ へ移り、drafts/ は消える。別の鍵は 400", async () => {
    const cookie = await login();
    const draftKey = "drafts/00000000-0000-0000-0000-000000000002";
    await env.PHOTOS.put(draftKey, PNG, { httpMetadata: { contentType: "image/png" } });
    const meal = (image_key: string) => json({ image_key, title: "x", kcal: 1, protein_g: 1, fat_g: 1, carbs_g: 1 });
    expect((await call("/api/meals", meal("meals/00000000-0000-0000-0000-000000000002"), cookie)).status).toBe(400);
    const res = await call("/api/meals", meal(draftKey), cookie);
    expect(res.status).toBe(201);
    const { id, image_key } = (await res.json()) as { id: string; image_key: string };
    expect(image_key).toBe("meals/00000000-0000-0000-0000-000000000002");
    expect(await env.PHOTOS.head(draftKey)).toBeNull();
    expect(await env.PHOTOS.head(image_key)).not.toBeNull();
    const row = await env.DB.prepare("SELECT image_key FROM meals WHERE id = ?").bind(id).first<{ image_key: string }>();
    expect(row?.image_key).toBe(image_key);
    await call(`/api/meals/${id}`, { method: "DELETE" }, cookie);
    expect(await env.PHOTOS.head(image_key)).toBeNull();
  });

  it("存在しない在庫を consume すると 400 で何も保存しない", async () => {
    const cookie = await login();
    const res = await call("/api/meals", json({ title: "x", kcal: 1, protein_g: 1, fat_g: 1, carbs_g: 1, consume: [{ pantry_item_id: "nope", quantity: 1 }] }), cookie);
    expect(res.status).toBe(400);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM meals").first<{ n: number }>())!.n).toBe(0);
  });

  it("スキャンは在庫の name に合わせた食材候補を返す", async () => {
    const cookie = await login();
    await call("/api/pantry", json({ name: "卵", kind: "food", category: "protein", quantity: 5, unit: "個" }), cookie);
    await call("/api/pantry", json({ name: "醤油", kind: "seasoning", category: "seasoning" }), cookie);
    mockAnthropic({
      title: "卵かけご飯", kcal: 450, protein_g: 15, fat_g: 10, carbs_g: 70,
      ingredients: [{ name: "卵", quantity: 1 }, { name: "醤油" }, { name: "在庫にない物", quantity: 1 }],
    });
    const res = await call("/api/meals/scan", imageForm(), cookie);
    const body = (await res.json()) as { image_key: string; ingredients: { name: string; quantity: number; pantry_item_id: string }[] };
    expect(body.image_key).toMatch(/^drafts\//);
    expect(body.ingredients.map((i) => [i.name, i.quantity])).toEqual([["卵", 1]]);
  });
});

describe("筋トレ・在庫・設定", () => {
  it("筋トレの記録と種目の一覧、期間の絞り込み", async () => {
    const cookie = await login();
    const post = (b: object) => call("/api/workouts", json(b), cookie);
    expect((await post({ exercise: "スクワット", weight_kg: 80, reps: 5, sets: 5, done_at: "2026-10-10" })).status).toBe(201);
    const bench = (await (await post({ exercise: "ベンチプレス", done_at: "2026-10-14" })).json()) as { id: string };
    const list = (await (await call("/api/workouts?from=2026-10-12&to=2026-10-15", {}, cookie)).json()) as { workouts: { exercise: string }[] };
    expect(list.workouts.map((w) => w.exercise)).toEqual(["ベンチプレス"]);
    const ex = (await (await call("/api/workouts/exercises", {}, cookie)).json()) as { exercises: { exercise: string }[] };
    expect(ex.exercises.map((e) => e.exercise)).toEqual(["ベンチプレス", "スクワット"]);
    expect((await call(`/api/workouts/${bench.id}`, { method: "DELETE" }, cookie)).status).toBe(200);
    expect((await post({ exercise: "", })).status).toBe(400);
  });

  it("在庫の手動編集と重複", async () => {
    const cookie = await login();
    const created = (await (await call("/api/pantry", json({ name: "卵", kind: "food", category: "protein", quantity: 1, unit: "個" }), cookie)).json()) as Pantry;
    expect((await call("/api/pantry", json({ name: "卵", kind: "food", category: "protein" }), cookie)).status).toBe(409);
    const patched = await call(`/api/pantry/${created.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: 7 }) }, cookie);
    expect(((await patched.json()) as Pantry).quantity).toBe(7);
    expect((await call(`/api/pantry/${created.id}`, { method: "DELETE" }, cookie)).status).toBe(200);
    expect((await call(`/api/pantry/${created.id}`, { method: "DELETE" }, cookie)).status).toBe(404);
  });

  it("設定の取得と更新", async () => {
    const cookie = await login();
    const s = (await (await call("/api/settings", {}, cookie)).json()) as Record<string, number>;
    expect(s).toEqual({ monthly_budget_yen: 30000, protein_target_g: 120, kcal_target: 2000, workouts_per_week: 3 });
    const put = await call("/api/settings", { ...json({ ...s, monthly_budget_yen: 25000 }), method: "PUT" }, cookie);
    expect(((await put.json()) as Record<string, number>).monthly_budget_yen).toBe(25000);
    expect((await call("/api/settings", { ...json({ monthly_budget_yen: -1 }), method: "PUT" }, cookie)).status).toBe(400);
  });
});

describe("サマリー（日本時間の区切り）", () => {
  it("月・日・週の集計", async () => {
    const insertReceipt = (id: string, day: string, yen: number) =>
      env.DB.prepare("INSERT INTO receipts (id, store, purchased_at, total_yen, created_at) VALUES (?, 's', ?, ?, 'x')").bind(id, day, yen).run();
    await insertReceipt("r1", "2026-09-30", 5000); // 先月：数えない
    await insertReceipt("r2", "2026-10-01", 3000);
    await insertReceipt("r3", "2026-10-14", 2000);
    const meal = (id: string, at: string, kcal: number, p: number) =>
      env.DB.prepare("INSERT INTO meals (id, eaten_at, title, kcal, protein_g, fat_g, carbs_g, created_at) VALUES (?, ?, 'm', ?, ?, 0, 0, 'x')").bind(id, at, kcal, p).run();
    await meal("m1", "2026-10-14T23:50", 700, 30); // 前日
    await meal("m2", "2026-10-15T00:10", 500, 20);
    await meal("m3", "2026-10-15T19:00", 600, 40);
    const wo = (id: string, day: string) => env.DB.prepare("INSERT INTO workouts (id, done_at, exercise, created_at) VALUES (?, ?, 'x', 'x')").bind(id, day).run();
    await wo("w0", "2026-10-11"); // 先週の日曜
    await wo("w1", "2026-10-12");
    await wo("w2", "2026-10-12"); // 同じ日は1回
    await wo("w3", "2026-10-15");
    await env.DB.prepare("INSERT INTO pantry_items (id, name, kind, category, quantity, unit, level, updated_at) VALUES ('p1','卵','food','protein',0,'個',NULL,'x'), ('p2','醤油','seasoning','seasoning',NULL,NULL,'low','x'), ('p3','塩','seasoning','seasoning',NULL,NULL,'full','x'), ('p4','米','food','staple',3,'kg',NULL,'x')").run();

    // UTC 2026-10-14T16:00 = 日本時間 10/15 01:00
    const s = await buildSummary(env, new Date("2026-10-14T16:00:00Z"));
    expect(s.today).toBe("2026-10-15");
    expect(s.month).toMatchObject({ month: "2026-10", spent_yen: 5000, budget_yen: 30000, remaining_yen: 25000, days_left: 17, daily_allowance_yen: 1470 });
    expect(s.meals_today).toMatchObject({ kcal: 1100, protein_g: 60, kcal_target: 2000, protein_target_g: 120 });
    expect(s.workouts_week).toEqual({ from: "2026-10-12", to: "2026-10-18", sessions: 2, target: 3 });
    expect(s.pantry_low.items.map((i) => [i.name, i.status])).toEqual([["卵", "out"], ["醤油", "low"]]);
  });
});
