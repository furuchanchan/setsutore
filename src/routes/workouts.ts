import { Hono } from "hono";
import { HttpError } from "../errors";
import type { AppEnv } from "../env";
import { workoutInputSchema, daySchema } from "../schemas";
import { addDays, jstDay } from "../time";
import { parseInput, readJson } from "../validate";

export const workoutRoutes = new Hono<AppEnv>();

workoutRoutes.get("/workouts/exercises", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT exercise, MAX(done_at) AS last_done_at, COUNT(*) AS times
     FROM workouts GROUP BY exercise ORDER BY last_done_at DESC, exercise LIMIT 30`,
  ).all();
  return c.json({ exercises: results });
});

workoutRoutes.get("/workouts", async (c) => {
  const today = jstDay(new Date());
  const from = parseInput(daySchema, c.req.query("from") ?? addDays(today, -30));
  const to = parseInput(daySchema, c.req.query("to") ?? today);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM workouts WHERE done_at >= ? AND done_at <= ? ORDER BY done_at DESC, created_at DESC",
  )
    .bind(from, to)
    .all();
  return c.json({ from, to, workouts: results });
});

workoutRoutes.post("/workouts", async (c) => {
  const w = await readJson(c, workoutInputSchema);
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    done_at: w.done_at ?? jstDay(now),
    exercise: w.exercise,
    weight_kg: w.weight_kg ?? null,
    reps: w.reps ?? null,
    sets: w.sets ?? null,
    note: w.note ?? null,
    created_at: now.toISOString(),
  };
  await c.env.DB.prepare(
    "INSERT INTO workouts (id, done_at, exercise, weight_kg, reps, sets, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(row.id, row.done_at, row.exercise, row.weight_kg, row.reps, row.sets, row.note, row.created_at)
    .run();
  return c.json(row, 201);
});

workoutRoutes.delete("/workouts/:id", async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM workouts WHERE id = ?").bind(c.req.param("id")).run();
  if (r.meta.changes === 0) throw new HttpError(404, "その筋トレの記録はありません");
  return c.json({ ok: true });
});
