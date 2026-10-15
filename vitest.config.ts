import path from "node:path";
import fs from "node:fs";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // wrangler.jsonc の assets.directory が存在しないと起動できないため、空のまま用意する
  fs.mkdirSync(path.join(import.meta.dirname, "web/dist"), { recursive: true });
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, APP_PASSCODE: "test-passcode-1234", ANTHROPIC_API_KEY: "sk-ant-test-key-0000000000000000" },
        },
      }),
    ],
    test: { globals: true, setupFiles: ["./test/setup.ts"] },
  };
});
