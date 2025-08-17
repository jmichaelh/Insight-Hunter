# Insight Hunter API (Cloudflare Workers + MongoDB Data API)

## Endpoints
- `GET /health`
- `GET /api/transactions/:companyId`
- `POST /api/reports/generate` (body: `{ companyId, start, end }`)
- `GET /api/cashflow/forecast?companyId=...&months=6`
- `POST /api/import/csv` (raw CSV body; headers: `date,type,amount,company_id,description`)

## Deploy (one-time)
```bash
npm install
npx wrangler login
npx wrangler secret put MONGO_DATA_API_URL
npx wrangler secret put MONGO_DATA_API_KEY
npx wrangler secret put MONGO_DATA_SOURCE
npx wrangler secret put MONGO_DATABASE
npm run deploy
```
