-- セツトレの初期スキーマ。日付・日時はすべて日本時間（Asia/Tokyo）のローカル表記で持つ
-- purchased_at / done_at: YYYY-MM-DD、eaten_at: YYYY-MM-DDTHH:MM（先頭10文字が日付）
-- created_at / updated_at は UTC の ISO 8601

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  monthly_budget_yen INTEGER NOT NULL DEFAULT 30000,
  protein_target_g INTEGER NOT NULL DEFAULT 120,
  kcal_target INTEGER NOT NULL DEFAULT 2000,
  workouts_per_week INTEGER NOT NULL DEFAULT 3
);

INSERT INTO settings (id) VALUES (1);

CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  purchased_at TEXT NOT NULL,
  total_yen INTEGER NOT NULL,
  image_key TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_receipts_purchased_at ON receipts (purchased_at);

CREATE TABLE receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts (id) ON DELETE CASCADE,
  printed_name TEXT NOT NULL,
  food_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('protein', 'vegetable', 'staple', 'seasoning', 'snack', 'drink', 'other')),
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  price_yen INTEGER NOT NULL
);

CREATE INDEX idx_receipt_items_receipt_id ON receipt_items (receipt_id);

CREATE TABLE pantry_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('food', 'seasoning')),
  category TEXT NOT NULL CHECK (category IN ('protein', 'vegetable', 'staple', 'seasoning', 'snack', 'drink', 'other')),
  quantity REAL,
  unit TEXT,
  level TEXT CHECK (level IN ('full', 'half', 'low', 'out')),
  updated_at TEXT NOT NULL
);

CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  eaten_at TEXT NOT NULL,
  image_key TEXT,
  title TEXT NOT NULL,
  kcal INTEGER NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_meals_eaten_at ON meals (eaten_at);

CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  done_at TEXT NOT NULL,
  exercise TEXT NOT NULL,
  weight_kg REAL,
  reps INTEGER,
  sets INTEGER,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_workouts_done_at ON workouts (done_at);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE login_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  failed_at INTEGER NOT NULL
);

CREATE INDEX idx_login_failures_ip ON login_failures (ip, failed_at);

CREATE TABLE ai_usage (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL
);
