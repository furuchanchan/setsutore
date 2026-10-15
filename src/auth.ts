import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { HttpError } from "./errors";
import type { AppEnv } from "./env";

export const SESSION_COOKIE = "st_session";
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
export const LOGIN_FAILURE_LIMIT = 10;
export const LOGIN_FAILURE_WINDOW_MS = 60 * 60 * 1000;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, enc.encode(message));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** 合言葉の定数時間比較（長さの違いも漏らさないよう、固定長の HMAC 同士で比べる） */
export async function passcodeMatches(input: string, secret: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmac(secret, `passcode:${input}`), hmac(secret, `passcode:${secret}`)]);
  return equalBytes(new Uint8Array(a), new Uint8Array(b));
}

/** トークン形式: <有効期限(unix秒)>.<HMAC-SHA256(鍵=APP_PASSCODE, "session:<有効期限>")> */
export async function signToken(secret: string, nowMs: number): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SEC;
  return `${exp}.${b64url(await hmac(secret, `session:${exp}`))}`;
}

export async function verifyToken(secret: string, token: string | undefined, nowMs: number): Promise<boolean> {
  if (!token) return false;
  const m = /^(\d{1,12})\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp <= Math.floor(nowMs / 1000)) return false;
  const expected = b64url(await hmac(secret, `session:${exp}`));
  return equalBytes(enc.encode(expected), enc.encode(m[2]!));
}

export function requirePasscodeConfigured(secret: string | undefined): string {
  if (!secret) throw new HttpError(500, "APP_PASSCODE が設定されていません。scripts/set-secrets.sh で登録してください");
  return secret;
}

export function clientIp(headers: Headers): string {
  return headers.get("CF-Connecting-IP") ?? "unknown";
}

/** 直近1時間のこの IP の失敗回数 */
export async function recentFailures(db: D1Database, ip: string, nowMs: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND failed_at > ?")
    .bind(ip, nowMs - LOGIN_FAILURE_WINDOW_MS)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function recordFailure(db: D1Database, ip: string, nowMs: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM login_failures WHERE failed_at <= ?").bind(nowMs - LOGIN_FAILURE_WINDOW_MS),
    db.prepare("INSERT INTO login_failures (ip, failed_at) VALUES (?, ?)").bind(ip, nowMs),
  ]);
}

/** /api/login と /api/health 以外はすべて cookie 必須 */
export const authGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path;
  if (path === "/api/health") return next();
  const secret = requirePasscodeConfigured(c.env.APP_PASSCODE);
  if (path === "/api/login") return next();
  const ok = await verifyToken(secret, getCookie(c, SESSION_COOKIE), Date.now());
  if (!ok) throw new HttpError(401, "ログインが必要です");
  return next();
};
