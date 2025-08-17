
# Insight Hunter API (Cloudflare Workers + D1)

## Bootstrap
```bash
npm install
npx wrangler login
# Create D1; copy database_id from output into wrangler.toml
npx wrangler d1 create insighthunter_db
# Apply migrations
npm run migrate:apply
# Deploy
npm run deploy
```
## Endpoints
- GET /health
- GET /api/transactions/:companyId
- POST /api/reports/generate
- GET /api/cashflow/forecast
- POST /api/import/csv
