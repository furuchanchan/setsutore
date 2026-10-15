import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

// 各テストの前に D1 を初期状態へ戻す
beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const tables = [
    "receipt_items",
    "receipts",
    "pantry_items",
    "meals",
    "workouts",
    "chat_messages",
    "login_failures",
    "ai_usage",
  ];
  await env.DB.batch(tables.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  await env.DB.prepare(
    "UPDATE settings SET monthly_budget_yen = 30000, protein_target_g = 120, kcal_target = 2000, workouts_per_week = 3 WHERE id = 1",
  ).run();
});
