import { Hono } from "hono";
import { HttpError } from "../errors";
import type { AppEnv } from "../env";

export const photoRoutes = new Hono<AppEnv>();

photoRoutes.get("/photos/*", async (c) => {
  const key = decodeURIComponent(c.req.path.slice("/api/photos/".length));
  if (!/^(drafts|receipts|meals)\/[0-9a-f-]{36}$/.test(key)) throw new HttpError(404, "写真が見つかりません");
  const obj = await c.env.PHOTOS.get(key);
  if (!obj) throw new HttpError(404, "写真が見つかりません");
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
    },
  });
});
