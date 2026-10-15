import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { authGuard } from "./auth";
import type { AppEnv } from "./env";
import { HttpError } from "./errors";
import { authRoutes } from "./routes/auth";
import { mealRoutes } from "./routes/meals";
import { pantryRoutes } from "./routes/pantry";
import { photoRoutes } from "./routes/photos";
import { receiptRoutes } from "./routes/receipts";
import { settingsRoutes } from "./routes/settings";
import { summaryRoutes } from "./routes/summary";
import { talkRoutes } from "./routes/talk";
import { workoutRoutes } from "./routes/workouts";

export const app = new Hono<AppEnv>().basePath("/api");

app.use("*", authGuard);
app.get("/health", (c) => c.json({ ok: true }));
app.route("/", authRoutes);
app.route("/", summaryRoutes);
app.route("/", settingsRoutes);
app.route("/", receiptRoutes);
app.route("/", pantryRoutes);
app.route("/", talkRoutes);
app.route("/", mealRoutes);
app.route("/", workoutRoutes);
app.route("/", photoRoutes);

app.notFound((c) => c.json({ error: "そのAPIはありません" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (err instanceof Anthropic.APIError) {
    console.error("anthropic error", err.status, err.message);
    return c.json({ error: `AI の呼び出しに失敗しました（status ${err.status ?? "接続エラー"}）` }, 502);
  }
  console.error("unhandled error", err);
  return c.json({ error: "サーバー内部のエラーです" }, 500);
});

export default app;
