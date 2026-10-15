import { Hono } from "hono";
import type { AppEnv } from "../env";
import { settingsSchema } from "../schemas";
import { readJson } from "../validate";
import { loadSettings } from "./summary";

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get("/settings", async (c) => c.json(await loadSettings(c.env.DB)));

settingsRoutes.put("/settings", async (c) => {
  const s = await readJson(c, settingsSchema);
  await c.env.DB.prepare(
    "UPDATE settings SET monthly_budget_yen = ?, protein_target_g = ?, kcal_target = ?, workouts_per_week = ? WHERE id = 1",
  )
    .bind(s.monthly_budget_yen, s.protein_target_g, s.kcal_target, s.workouts_per_week)
    .run();
  return c.json(await loadSettings(c.env.DB));
});
