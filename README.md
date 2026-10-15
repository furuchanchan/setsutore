# セツトレ

節約しながら筋トレする人のための、スマホ向け個人用 Web アプリです。レシートを撮ると食費と冷蔵庫の在庫が、食事を撮るとカロリーとタンパク質が、一言しゃべると在庫と筋トレの記録が更新されます。1人用で、各自が自分の Cloudflare アカウントに置いて使います。

このリポジトリは裏側（API・保存・AI 読み取り）と、ビルドが通る最小の画面の雛形です。画面のデザインは `web/` に別途作ります。

## 機能

- レシート読み取り: 写真から店名・日付・合計・品目を読み取り、略称（「国産若鶏ムネ」）を一般的な食材名（「鶏むね肉」）に直した下書きを返します。直して保存すると、食費に計上され、選んだ品目が在庫に足されます。
- 在庫: 食材は数量、調味料は「たっぷり / 半分 / もうすぐ切れ / 切れ」で管理します。手で直せるほか、会話でも更新できます。
- 会話: 「卵あと3個、醤油もうすぐ切れそう」のような一言から、在庫と筋トレの記録を更新します。返事はマスコットの口調で短く返ります。
- 食事: 写真から料理名・カロリー・タンパク質・脂質・炭水化物の目安と、使った食材の候補を返します。保存すると在庫が減ります。
- 筋トレ: 種目・重さ・回数・セット数の記録と、最近使った種目の一覧。
- サマリー: 今月の食費と残り・日割りの目安、今日のカロリーとタンパク質、今週の筋トレ回数、残りわずかの在庫。日付の区切りはすべて日本時間です。

## 構成

1つの Cloudflare Worker（TypeScript）で動きます。

- `src/`: Hono の API（`/api/*`）。D1（SQLite）にデータ、R2 に写真を保存します。
- `web/`: Vite + React の画面。ビルドした `web/dist` を Workers の静的アセットとして配ります。
- AI: Anthropic の API を直接呼びます（モデルは `claude-haiku-5-5`、tool use で構造化して受け取ります）。1日の呼び出し回数に上限があります（`AI_DAILY_LIMIT`、既定 200 回、日本時間の 0 時で数え直し）。
- 認証: 合言葉（`APP_PASSCODE`）でログインし、30日有効の署名付き cookie で守ります。ログインの失敗は IP ごとに1時間10回までです。
- `migrations/`: D1 のスキーマ。`test/`: vitest（AI は実際には呼びません）。

## 自分の Cloudflare に置く手順

前提: Node.js、Cloudflare アカウント、Anthropic の API キー。

```sh
npm install
npm --prefix web install
npx wrangler login

# 1. D1 と R2 を作る
npx wrangler d1 create setsutore
npx wrangler r2 bucket create setsutore-photos
```

`wrangler d1 create` で出た `database_id` を `wrangler.jsonc` の `REPLACE_ME` に書き換えます。

```sh
# 2. テーブルを作る
npm run db:migrate:remote

# 3. 秘密を登録する（鍵と合言葉。画面には出ません）
zsh scripts/set-secrets.sh

# 4. 公開する
npm run deploy
```

秘密の値はコードにもリポジトリにも入れません。`.dev.vars` も使いません。

## 開発

```sh
npm run dev         # ローカルで Worker を起動（wrangler dev）
npm test            # vitest（Workers の実行環境で D1・R2 も動かす）
npm run typecheck
npm run build       # web/dist を作る
```

## API

`/api/login` と `/api/health` 以外は、ログインの cookie（`st_session`）が必要です。入力が不正なら 400、上限超過は 429、AI の鍵が無ければ 503 で理由を返します。

- `POST /api/login` `{passcode}` / `POST /api/logout` / `GET /api/health`
- `GET /api/summary`
- `GET|PUT /api/settings`
- `POST /api/receipts/scan`（画像）→ 下書き / `POST /api/receipts` / `GET /api/receipts?month=YYYY-MM` / `DELETE /api/receipts/:id`
- `GET /api/pantry` / `POST|PATCH|DELETE /api/pantry/:id`
- `POST /api/talk` `{text}`
- `POST /api/meals/scan`（画像）→ 下書き / `POST /api/meals` / `GET /api/meals?date=YYYY-MM-DD` / `DELETE /api/meals/:id`
- `GET /api/workouts?from=&to=` / `POST /api/workouts` / `DELETE /api/workouts/:id` / `GET /api/workouts/exercises`
- `GET /api/photos/*`

## ライセンス

MIT
