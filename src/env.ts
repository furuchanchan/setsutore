export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  PHOTOS: R2Bucket;
  AI_DAILY_LIMIT: string;
  APP_PASSCODE?: string;
  ANTHROPIC_API_KEY?: string;
};

export type AppEnv = { Bindings: Bindings };
