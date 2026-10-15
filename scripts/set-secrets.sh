#!/bin/zsh
# セツトレの秘密を、画面に表示せずに Cloudflare の Worker Secret へ登録する。
#   ANTHROPIC_API_KEY ... Anthropic の API キー（https://platform.claude.com/settings/keys で作る）
#   APP_PASSCODE ........ アプリにログインするための合言葉（8文字以上・自分で決める）
# 使い方: リポジトリの直下で  zsh scripts/set-secrets.sh
# 先に一度 npx wrangler login（または CLOUDFLARE_API_TOKEN の設定）が必要。値は画面にもコマンドの引数にも出さない。
set -euo pipefail

read -rs "key?Anthropic の API キーを貼り付けて Enter: "; echo
key="${key//[[:space:]]/}"
if [[ ! "$key" =~ '^sk-ant-[A-Za-z0-9_-]{20,}$' ]]; then
  echo "Anthropic の API キーの形（sk-ant- で始まる）ではありません（${#key}文字）。何も登録していません。"
  exit 1
fi
code=$(printf 'x-api-key: %s\n' "$key" | curl -s -o /dev/null -w '%{http_code}' -H @- -H 'anthropic-version: 2023-06-01' https://api.anthropic.com/v1/models)
if [[ "$code" != 200 ]]; then
  echo "Anthropic がこの鍵を受け付けませんでした（HTTP $code）。何も登録していません。"
  exit 1
fi

read -rs "pass1?アプリの合言葉（8文字以上）を入力して Enter: "; echo
read -rs "pass2?もう一度入力して Enter: "; echo
if [[ "$pass1" != "$pass2" ]]; then
  echo "2回の入力が一致しません。何も登録していません。"
  exit 1
fi
if (( ${#pass1} < 8 )); then
  echo "合言葉は8文字以上にしてください。何も登録していません。"
  exit 1
fi

printf '%s' "$key" | npx wrangler secret put ANTHROPIC_API_KEY --name setsutore
printf '%s' "$pass1" | npx wrangler secret put APP_PASSCODE --name setsutore
unset key code pass1 pass2
echo "登録しました（ANTHROPIC_API_KEY は Anthropic で使えることを確認済み）。"
