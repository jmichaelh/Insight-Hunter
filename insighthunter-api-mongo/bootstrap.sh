#!/usr/bin/env bash
set -euo pipefail

echo "==> Insight Hunter API bootstrap"

# Ensure wrangler
if ! command -v wrangler >/dev/null 2>&1; then
  echo "Wrangler not found. Install with: npm i -g wrangler"
  exit 1
fi

# Login if needed
if ! wrangler whoami >/dev/null 2>&1; then
  wrangler login
fi

# Secrets
read -p "MONGO_DATA_API_URL: " MONGO_DATA_API_URL
read -p "MONGO_DATA_API_KEY: " MONGO_DATA_API_KEY
read -p "MONGO_DATA_SOURCE (e.g., Cluster0): " MONGO_DATA_SOURCE
read -p "MONGO_DATABASE (e.g., insighthunter): " MONGO_DATABASE

wrangler secret put MONGO_DATA_API_URL <<< "$MONGO_DATA_API_URL"
wrangler secret put MONGO_DATA_API_KEY <<< "$MONGO_DATA_API_KEY"
wrangler secret put MONGO_DATA_SOURCE <<< "$MONGO_DATA_SOURCE"
wrangler secret put MONGO_DATABASE <<< "$MONGO_DATABASE"

npm install
npm run deploy

echo "==> Deployed."
