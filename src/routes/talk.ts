import { Hono } from "hono";
import { z } from "zod";
import { callTool, reserveAiCall } from "../ai";
import type { AppEnv } from "../env";
import { PantryState, applyOps, loadPantry, opSchema, pantryStatements, workoutStatement } from "../pantry";
import { talkSchema } from "../schemas";
import { jstDay } from "../time";
import { readJson } from "../validate";

const applySchema = z.object({
  reply: z.string().min(1).max(400).describe("ユーザーへの短い返事（日本語・やわらかい口調・絵文字なし）"),
  ops: z.array(opSchema).max(20).describe("在庫・筋トレに反映する操作。反映することが無ければ空配列"),
});

const SYSTEM = `あなたは「セツトレ」のマスコットです。節約しながら筋トレしている飼い主の、冷蔵庫・調味料の在庫と筋トレの記録を手伝います。
ユーザーの一言を読み、apply ツールを必ず1回だけ呼んで返してください。
- reply: 1〜2文の短い日本語。やわらかい口調（です・ますを基本に、親しみのある言い回し）。絵文字は使わない。
- ops: 在庫や筋トレに反映する操作。
  - set_pantry: 在庫の数量や残りを更新・追加する。name は一般的な食材名で、在庫一覧にある名前があればそれに合わせる。
    食材（food）は quantity と unit（個・パック・g など）を入れる。調味料（seasoning）は level（full=たっぷり / half=半分 / low=もうすぐ切れそう / out=切れた）を入れる。
    「あと3個」のように残りを言われたら、その数を quantity にする（足し算ではない）。
  - remove_pantry: 食べきった・捨てた・もう無いものを在庫から消す。
  - log_workout: 筋トレをした記録。exercise は種目名。重さ・回数・セット数を言われた分だけ入れる。日付は言われたときだけ done_at（YYYY-MM-DD）に入れる。
- 言われていないことを作らない。反映するものが無い雑談や質問は ops を空にして reply だけ返す。`;

export const talkRoutes = new Hono<AppEnv>();

talkRoutes.get("/talk/messages", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, role, content, created_at FROM chat_messages ORDER BY created_at DESC, id DESC LIMIT 50",
  ).all();
  return c.json({ messages: results.reverse() });
});

talkRoutes.post("/talk", async (c) => {
  const { text } = await readJson(c, talkSchema);
  const db = c.env.DB;
  const now = new Date();
  await reserveAiCall(c.env, now);

  const pantry = await loadPantry(db);
  const { results: recent } = await db
    .prepare("SELECT role, content FROM chat_messages ORDER BY created_at DESC, id DESC LIMIT 10")
    .all<{ role: "user" | "assistant"; content: string }>();
  const history = recent.reverse();
  while (history[0]?.role === "assistant") history.shift();

  const pantryText = pantry.length
    ? pantry
        .map((p) => `- ${p.name}（${p.kind}）${p.quantity !== null ? ` ${p.quantity}${p.unit ?? ""}` : ""}${p.level ? ` level=${p.level}` : ""}`)
        .join("\n")
    : "（在庫は空です）";
  const today = jstDay(now);

  const out = await callTool(c.env, {
    system: SYSTEM,
    history,
    text: `今日は ${today} です。\n今の在庫:\n${pantryText}\n\nユーザーの一言: ${text}`,
    toolName: "apply",
    toolDescription: "返事と、在庫・筋トレへの反映内容を返す",
    schema: applySchema,
    maxTokens: 2048,
  });

  const state = new PantryState(pantry);
  const nowIso = now.toISOString();
  const { workouts, changes } = applyOps(state, out.ops, today, nowIso);
  await db.batch([
    ...pantryStatements(db, state),
    ...workouts.map((w) => workoutStatement(db, w)),
    db.prepare("INSERT INTO chat_messages (role, content, created_at) VALUES ('user', ?, ?)").bind(text, nowIso),
    db
      .prepare("INSERT INTO chat_messages (role, content, created_at) VALUES ('assistant', ?, ?)")
      .bind(out.reply, new Date(now.getTime() + 1).toISOString()),
  ]);
  return c.json({ reply: out.reply, changes, pantry: await loadPantry(db) });
});
