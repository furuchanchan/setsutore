import type { Context } from "hono";
import type { z } from "zod";
import { HttpError } from "./errors";

/** リクエストの入力を検証し、不正なら400と理由を返す */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const reason = r.error.issues
      .map((i) => `${i.path.length ? i.path.join(".") : "(入力)"}: ${i.message}`)
      .join(" / ");
    throw new HttpError(400, `入力が正しくありません: ${reason}`);
  }
  return r.data;
}

export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, "JSON として読めませんでした");
  }
  return parseInput(schema, body);
}
