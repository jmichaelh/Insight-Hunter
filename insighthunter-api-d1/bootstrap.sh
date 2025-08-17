#!/usr/bin/env bash
set -euo pipefail
echo "==> Insight Hunter API (D1) bootstrap"

if ! command -v wrangler >/dev/null 2>&1; then
  echo "Install Wrangler: npm i -g wrangler"
  exit 1
fi

wrangler whoami >/dev/null 2>&1 || wrangler login
npm install

# Replace database_id placeholder if needed
if grep -q "<REPLACE_WITH_DATABASE_ID>" wrangler.toml; then
  OUT=$(wrangler d1 create insighthunter_db)
  DB_ID=$(echo "$OUT" | grep -Eo '[0-9a-f-]{36}' | head -n1)
  if [ -z "$DB_ID" ]; then
    echo "$OUT"
    echo "Could not parse database_id"
    exit 1
  fi
  sed -i.bak "s|<REPLACE_WITH_DATABASE_ID>|$DB_ID|g" wrangler.toml && rm -f wrangler.toml.bak
fi

npm run migrate:apply
npm run deploy
echo "==> Done."
