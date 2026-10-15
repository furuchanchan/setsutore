import { Hono } from "hono";
import type { AppEnv, Bindings } from "../env";
import { addDays, daysInMonth, jstDay, jstMonth, weekStart } from "../time";

export type Settings = {
  monthly_budget_yen: number;
  protein_target_g: number;
  kcal_target: number;
  workouts_per_week: number;
};

export async function loadSettings(db: D1Database): Promise<Settings> {
  const row = await db
    .prepare("SELECT monthly_budget_yen, protein_target_g, kcal_target, workouts_per_week FROM settings WHERE id = 1")
    .first<Settings>();
  if (!row) throw new Error("settings の行がありません。migrations を適用してください");
  return row;
}

export async function buildSummary(env: Bindings, now: Date) {
  const today = jstDay(now);
  const month = jstMonth(now);
  const monday = weekStart(today);
  const sunday = addDays(monday, 6);

  const [settings, spent, meals, week, low] = await Promise.all([
    loadSettings(env.DB),
    env.DB.prepare("SELECT COALESCE(SUM(total_yen), 0) AS v FROM receipts WHERE substr(purchased_at, 1, 7) = ?")
      .bind(month)
      .first<{ v: number }>(),
    env.DB.prepare(
      "SELECT COALESCE(SUM(kcal), 0) AS kcal, COALESCE(SUM(protein_g), 0) AS protein FROM meals WHERE substr(eaten_at, 1, 10) = ?",
    )
      .bind(today)
      .first<{ kcal: number; protein: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT done_at) AS v FROM workouts WHERE done_at >= ? AND done_at <= ?")
      .bind(monday, sunday)
      .first<{ v: number }>(),
    env.DB.prepare(
      `SELECT id, name, CASE WHEN level = 'out' OR quantity <= 0 THEN 'out' ELSE 'low' END AS status
       FROM pantry_items
       WHERE level IN ('low', 'out') OR (quantity IS NOT NULL AND quantity <= 0)
       ORDER BY name`,
    ).all<{ id: string; name: string; status: "low" | "out" }>(),
  ]);

  const spentYen = spent?.v ?? 0;
  const remaining = settings.monthly_budget_yen - spentYen;
  const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1;
  return {
    today,
    month: {
      month,
      spent_yen: spentYen,
      budget_yen: settings.monthly_budget_yen,
      remaining_yen: remaining,
      days_left: daysLeft,
      daily_allowance_yen: Math.floor(Math.max(remaining, 0) / daysLeft),
    },
    meals_today: {
      kcal: meals?.kcal ?? 0,
      kcal_target: settings.kcal_target,
      protein_g: meals?.protein ?? 0,
      protein_target_g: settings.protein_target_g,
    },
    workouts_week: { from: monday, to: sunday, sessions: week?.v ?? 0, target: settings.workouts_per_week },
    pantry_low: { count: low.results.length, items: low.results },
  };
}

export const summaryRoutes = new Hono<AppEnv>().get("/summary", async (c) => c.json(await buildSummary(c.env, new Date())));
