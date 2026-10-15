import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SESSION_TTL_SEC, passcodeMatches, signToken, verifyToken } from "../src/auth";
import { PASSCODE, call, json, login } from "./helpers";

const SECRET = "secret-secret";
const T0 = Date.UTC(2026, 9, 15, 0, 0, 0);

describe("トークン", () => {
  it("署名したトークンは検証を通る", async () => {
    const t = await signToken(SECRET, T0);
    expect(await verifyToken(SECRET, t, T0 + 1000)).toBe(true);
  });

  it("30日後には期限切れ", async () => {
    const t = await signToken(SECRET, T0);
    expect(await verifyToken(SECRET, t, T0 + (SESSION_TTL_SEC - 1) * 1000)).toBe(true);
    expect(await verifyToken(SECRET, t, T0 + SESSION_TTL_SEC * 1000)).toBe(false);
  });

  it("鍵違い・改ざん・不正な形は弾く", async () => {
    const t = await signToken(SECRET, T0);
    expect(await verifyToken("other-secret", t, T0)).toBe(false);
    const [exp, sig] = t.split(".");
    expect(await verifyToken(SECRET, `${Number(exp) + 1000}.${sig}`, T0)).toBe(false);
    expect(await verifyToken(SECRET, `${exp}.${sig}x`, T0)).toBe(false);
    expect(await verifyToken(SECRET, "garbage", T0)).toBe(false);
    expect(await verifyToken(SECRET, undefined, T0)).toBe(false);
  });

  it("合言葉の比較", async () => {
    expect(await passcodeMatches("abc", "abc")).toBe(true);
    expect(await passcodeMatches("abd", "abc")).toBe(false);
    expect(await passcodeMatches("", "abc")).toBe(false);
  });
});

describe("認証 API", () => {
  it("正しい合言葉で cookie が付く", async () => {
    const res = await call("/api/login", json({ passcode: PASSCODE }));
    expect(res.status).toBe(200);
    const c = res.headers.get("Set-Cookie")!;
    expect(c).toContain("st_session=");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
    expect(c).toContain(`Max-Age=${SESSION_TTL_SEC}`);
  });

  it("cookie が無い・不正なら 401、health は通る", async () => {
    expect((await call("/api/summary")).status).toBe(401);
    expect((await call("/api/summary", {}, "st_session=bad")).status).toBe(401);
    expect((await call("/api/health")).status).toBe(200);
    const cookie = await login();
    expect((await call("/api/summary", {}, cookie)).status).toBe(200);
  });

  it("logout で cookie を消す", async () => {
    const res = await call("/api/logout", { method: "POST" }, await login());
    expect(res.headers.get("Set-Cookie")).toContain("st_session=;");
  });

  it("失敗が10回を超えたら 429（成功した合言葉でも止まる）", async () => {
    const ip = { "CF-Connecting-IP": "203.0.113.5" };
    const bad = (i: string = "x") => call("/api/login", { ...json({ passcode: i }), headers: { ...ip, "Content-Type": "application/json" } });
    for (let i = 0; i < 10; i++) expect((await bad()).status).toBe(401);
    expect((await bad()).status).toBe(429);
    const ok = await call("/api/login", { ...json({ passcode: PASSCODE }), headers: { ...ip, "Content-Type": "application/json" } });
    expect(ok.status).toBe(429);
    // 別の IP は影響を受けない
    expect((await call("/api/login", json({ passcode: PASSCODE }))).status).toBe(200);
  });

  it("1時間たった失敗は数えない", async () => {
    const old = Date.now() - 61 * 60 * 1000;
    await env.DB.batch(Array.from({ length: 10 }, () => env.DB.prepare("INSERT INTO login_failures (ip, failed_at) VALUES ('unknown', ?)").bind(old)));
    expect((await call("/api/login", json({ passcode: PASSCODE }))).status).toBe(200);
  });

  it("APP_PASSCODE が無いと 500 で理由を返す", async () => {
    const res = await call("/api/summary", {}, "st_session=x", { APP_PASSCODE: undefined });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toContain("APP_PASSCODE");
    expect((await call("/api/login", json({ passcode: "x" }), undefined, { APP_PASSCODE: undefined })).status).toBe(500);
  });
});
