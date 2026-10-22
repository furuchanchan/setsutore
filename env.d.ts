declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    PHOTOS: R2Bucket;
    AI_DAILY_LIMIT: string;
    APP_PASSCODE?: string;
    ANTHROPIC_API_KEY?: string;
    TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
  }
}
