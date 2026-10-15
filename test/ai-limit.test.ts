import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reserveAiCall } from "../src/ai";
import type { Bindings } from "../src/env";
import { call, imageForm, login, mockAnthropic } from "./helpers";

const base = (over: Partial<Bindings> = {}): Bindings => ({ ...env, ...over }) as Bindings;
afterEach(() => vi.restoreAllMocks());

describe("AI の日次上限", () => {
  it("上限までは通り、超えたら 429", async () => {
    const now = new Date("2026-10-15T03:00:00Z");
    const e = base({ AI_DAILY_LIMIT: "2" });
    await reserveAiCall(e, now);
    await reserveAiCall(e, now);
    await expect(reserveAiCall(e, now)).rejects.toMatchObject({ status: 429 });
    const row = await env.DB.prepare("SELECT calls FROM ai_usage WHERE day = '2026-10-15'").first<{ calls: number }>();
    expect(row?.calls).toBe(2);
  });

  it("日本時間の 0 時（UTC 15:00）で数え直す", async () => {
    const e = base({ AI_DAILY_LIMIT: "1" });
    await reserveAiCall(e, new Date("2026-10-14T14:59:00Z"));
    await expect(reserveAiCall(e, new Date("2026-10-14T14:59:30Z"))).rejects.toMatchObject({ status: 429 });
    await reserveAiCall(e, new Date("2026-10-14T15:00:00Z"));
    const rows = await env.DB.prepare("SELECT day FROM ai_usage ORDER BY day").all<{ day: string }>();
    expect(rows.results.map((r) => r.day)).toEqual(["2026-10-14", "2026-10-15"]);
  });

  it("鍵が無ければ 503、上限 0 は常に 429", async () => {
    await expect(reserveAiCall(base({ ANTHROPIC_API_KEY: undefined }), new Date())).rejects.toMatchObject({ status: 503 });
    await expect(reserveAiCall(base({ AI_DAILY_LIMIT: "0" }), new Date())).rejects.toMatchObject({ status: 429 });
  });

  it("上限に達した日はスキャンも会話も 429 で、AI を呼ばない", async () => {
    const m = mockAnthropic({});
    const cookie = await login();
    const e = { AI_DAILY_LIMIT: "0" };
    expect((await call("/api/receipts/scan", imageForm(), cookie, e)).status).toBe(429);
    const talk = await call("/api/talk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "こんにちは" }) }, cookie, e);
    expect(talk.status).toBe(429);
    expect(m.requests).toHaveLength(0);
  });

  it("鍵が無いときの API は 503", async () => {
    const res = await call("/api/receipts/scan", imageForm(), await login(), { ANTHROPIC_API_KEY: undefined });
    expect(res.status).toBe(503);
  });
});
