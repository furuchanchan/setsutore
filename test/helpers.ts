import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { app } from "../src/index";
import type { Bindings } from "../src/env";

export const PASSCODE = "test-passcode-1234";

export function call(path: string, init: RequestInit = {}, cookie?: string, bindings: Partial<Bindings> = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  return app.fetch(new Request(`https://setsutore.test${path}`, { ...init, headers }), { ...env, ...bindings } as Bindings);
}

export function json(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function login(): Promise<string> {
  const res = await call("/api/login", json({ passcode: PASSCODE }));
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  return setCookie.split(";")[0]!;
}

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

export function imageForm(bytes: Uint8Array = PNG, type = "image/png"): RequestInit {
  const form = new FormData();
  form.set("image", new File([bytes], "x.png", { type }));
  return { method: "POST", body: form };
}

export type AnthropicRequest = {
  model: string;
  max_tokens: number;
  tool_choice: { type: string; name: string };
  tools: { name: string; input_schema: unknown }[];
  messages: { role: string; content: unknown }[];
  system?: string;
  [k: string]: unknown;
};

/** Anthropic への fetch を差し替え、forced tool の入力として toolInput を返す。実際の API は呼ばない */
export function mockAnthropic(toolInput: unknown) {
  const requests: AnthropicRequest[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const req = new Request(input as RequestInfo, init);
    if (!req.url.startsWith("https://api.anthropic.com/")) throw new Error(`想定外の外部通信: ${req.url}`);
    const body = (await req.json()) as AnthropicRequest;
    requests.push(body);
    return Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "tool_use", id: "toolu_test", name: body.tool_choice.name, input: toolInput }],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    });
  });
  return { requests, spy };
}
