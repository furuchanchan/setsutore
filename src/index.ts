import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { authGuard } from "./auth";
import type { AppEnv, Bindings } from "./env";
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

// workers.dev は Cloudflare のゾーン設定が効かず http でも届くので、画面も API も Worker で受けて https へそろえる（手元の wrangler dev だけ通す）
export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      if (request.method !== "GET" && request.method !== "HEAD") return Response.json({ error: "https でアクセスしてください" }, { status: 403 });
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    // workers.dev はゾーンの最小 TLS（1.2）が効かないので、古い TLS の要求はここで断る
    if (["TLSv1", "TLSv1.1"].includes(request.cf?.tlsVersion as string)) return Response.json({ error: "TLS 1.2 以上でアクセスしてください" }, { status: 426 });
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Bindings>;
