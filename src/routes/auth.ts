import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import {
  LOGIN_FAILURE_LIMIT,
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  clientIp,
  passcodeMatches,
  recentFailures,
  recordFailure,
  requirePasscodeConfigured,
  signToken,
} from "../auth";
import { HttpError } from "../errors";
import type { AppEnv } from "../env";
import { loginSchema } from "../schemas";
import { readJson } from "../validate";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  const secret = requirePasscodeConfigured(c.env.APP_PASSCODE);
  const { passcode } = await readJson(c, loginSchema);
  const ip = clientIp(c.req.raw.headers);
  const now = Date.now();
  if ((await recentFailures(c.env.DB, ip, now)) >= LOGIN_FAILURE_LIMIT) {
    throw new HttpError(429, "失敗が続いたため、しばらくしてからやり直してください");
  }
  if (!(await passcodeMatches(passcode, secret))) {
    await recordFailure(c.env.DB, ip, now);
    throw new HttpError(401, "合言葉が違います");
  }
  setCookie(c, SESSION_COOKIE, await signToken(secret, now), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  return c.json({ ok: true });
});

authRoutes.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  return c.json({ ok: true });
});
