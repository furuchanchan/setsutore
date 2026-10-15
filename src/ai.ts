import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { HttpError } from "./errors";
import type { Bindings } from "./env";
import { jstDay } from "./time";

export const AI_MODEL = "claude-haiku-5-5";

/** 呼び出し1回分を日次上限に数える。鍵が無ければ 503、上限超過なら 429 */
export async function reserveAiCall(env: Bindings, now: Date): Promise<void> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "ANTHROPIC_API_KEY が設定されていません。scripts/set-secrets.sh で登録してください");
  }
  const limit = Number(env.AI_DAILY_LIMIT);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new HttpError(500, "AI_DAILY_LIMIT が正の整数ではありません");
  }
  const row =
    limit === 0
      ? null
      : await env.DB.prepare(
          `INSERT INTO ai_usage (day, calls) VALUES (?, 1)
           ON CONFLICT (day) DO UPDATE SET calls = calls + 1 WHERE calls < ?
           RETURNING calls`,
        )
          .bind(jstDay(now), limit)
          .first<{ calls: number }>();
  if (!row) {
    throw new HttpError(429, `今日の AI 利用の上限（${limit}回）に達しました。日本時間の 0 時にリセットされます`);
  }
}

export type ImageInput = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export type ToolCall<S extends z.ZodType> = {
  system: string;
  text: string;
  images?: ImageInput[];
  history?: { role: "user" | "assistant"; content: string }[];
  toolName: string;
  toolDescription: string;
  schema: S;
  maxTokens: number;
};

/** tool use を強制して構造化出力を受け取り、zod で検証する */
export async function callTool<S extends z.ZodType>(env: Bindings, call: ToolCall<S>): Promise<z.output<S>> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  const { $schema: _omit, ...inputSchema } = z.toJSONSchema(call.schema, { io: "input" }) as Record<string, unknown>;

  const userContent: Anthropic.ContentBlockParam[] = [
    ...(call.images ?? []).map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      }),
    ),
    { type: "text", text: call.text },
  ];

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: call.maxTokens,
    system: call.system,
    tools: [
      {
        name: call.toolName,
        description: call.toolDescription,
        input_schema: inputSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: call.toolName },
    messages: [...(call.history ?? []), { role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    throw new HttpError(502, "AI がこの内容の処理を断りました。別の写真・文面でやり直してください");
  }
  if (response.stop_reason === "max_tokens") {
    throw new HttpError(502, "AI の応答が長すぎて途中で切れました。写真や文面を減らしてやり直してください");
  }
  const block = response.content.find((b) => b.type === "tool_use" && b.name === call.toolName);
  if (!block || block.type !== "tool_use") {
    throw new HttpError(502, "AI から構造化された応答が返りませんでした");
  }
  const parsed = call.schema.safeParse(block.input);
  if (!parsed.success) {
    throw new HttpError(502, "AI の応答が想定外の形でした。もう一度試してください");
  }
  return parsed.data;
}

// ---- 画像 ----

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 先頭バイトから種類を判定する（申告された Content-Type は信用しない） */
export function sniffImageType(bytes: Uint8Array): ImageInput["mediaType"] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export async function readUploadedImage(
  req: Request,
): Promise<{ bytes: Uint8Array; mediaType: ImageInput["mediaType"] }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_IMAGE_BYTES + 64 * 1024) throw new HttpError(413, "画像は 5MB までです");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "multipart/form-data として読めませんでした");
  }
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "image フィールドに画像ファイルを入れてください");
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "画像は 5MB までです");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniffImageType(bytes);
  if (!mediaType) throw new HttpError(400, "画像は jpeg / png / webp のみ対応しています");
  return { bytes, mediaType };
}
