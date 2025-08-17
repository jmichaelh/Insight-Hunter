import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Env = {
  MONGO_DATA_API_URL: string     // https://data.mongodb-api.com/app/<appid>/endpoint/data/v1
  MONGO_DATA_API_KEY: string
  MONGO_DATA_SOURCE: string      // e.g., "Cluster0"
  MONGO_DATABASE: string         // e.g., "insighthunter"
}

const app = new Hono<{ Bindings: Env }>()

// CORS: open for dev; restrict in prod to your Pages origin
app.use('/*', cors())

// ---- MongoDB Data API helper ----
async function mongo(c: any, action: string, payload: Record<string, unknown>) {
  const url = `${c.env.MONGO_DATA_API_URL}/${action}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': c.env.MONGO_DATA_API_KEY
    },
    body: JSON.stringify({
      dataSource: c.env.MONGO_DATA_SOURCE,
      database: c.env.MONGO_DATABASE,
      ...payload
    })
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Mongo Data API ${action} failed: ${res.status} ${t}`)
  }
  return res.json()
}

// Simple CSV parser
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i+1]
    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { cur += ch }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
      else if (ch === '\r') { /* skip */ }
      else { cur += ch }
    }
  }
  row.push(cur)
  rows.push(row)
  return rows.filter(r => r.length > 1 || (r.length===1 && r[0].trim().length>0))
}

app.get('/health', (c) => c.json({ ok: true, service: 'insight-hunter-api' }))

// GET /api/transactions/:companyId
app.get('/api/transactions/:companyId', async (c) => {
  const companyId = c.req.param('companyId')
  const res = await mongo(c, 'action/find', {
    collection: 'transactions',
    filter: { company_id: companyId },
    sort: { date: 1 }
  })
  return c.json(res)
})

// POST /api/reports/generate
// body: { companyId: string, start: string (YYYY-MM-DD), end: string }
app.post('/api/reports/generate', async (c) => {
  const { companyId, start, end } = await c.req.json()
  const tx = await mongo(c, 'action/find', {
    collection: 'transactions',
    filter: { company_id: companyId, date: { "$gte": start, "$lte": end } },
    sort: { date: 1 }
  }) as any

  let revenue = 0, cogs = 0, opex = 0
  for (const doc of (tx.documents ?? [])) {
    const t = (doc.type || '').toLowerCase()
    const amt = Number(doc.amount || 0)
    if (t === 'revenue') revenue += amt
    else if (t === 'cogs') cogs += amt
    else if (t === 'opex') opex += amt
  }
  const gp = revenue - cogs
  const net = gp - opex

  const report = {
    company_id: companyId,
    period_start: start,
    period_end: end,
    revenue, cogs, gp, opex, net,
    created_at: new Date().toISOString()
  }

  await mongo(c, 'action/insertOne', {
    collection: 'reports',
    document: report
  })

  return c.json(report)
})

// GET /api/cashflow/forecast?companyId=...&months=6
app.get('/api/cashflow/forecast', async (c) => {
  const url = new URL(c.req.url)
  const companyId = url.searchParams.get('companyId')!
  const months = Number(url.searchParams.get('months') || '6')

  const tx = await mongo(c, 'action/find', {
    collection: 'transactions',
    filter: { company_id: companyId },
    sort: { date: 1 }
  }) as any

  const map = new Map<string, number>()
  for (const d of (tx.documents ?? [])) {
    const m = String(d.date).slice(0,7) // YYYY-MM
    const amt = Number(d.amount || 0)
    const t = (d.type || '').toLowerCase()
    const sign = (t === 'revenue') ? 1 : -1
    map.set(m, (map.get(m) || 0) + sign*amt)
  }
  const monthsKeys = Array.from(map.keys()).sort()
  const series = monthsKeys.map(m => map.get(m) || 0)

  const n = series.length
  let sumX=0, sumY=0, sumXY=0, sumXX=0
  for (let i=0;i<n;i++){ sumX+=i; sumY+=series[i]; sumXY+=i*series[i]; sumXX+=i*i }
  const denom = n*sumXX - sumX*sumX || 1
  const a = (n*sumXY - sumX*sumY) / denom  // slope
  const b = (sumY - a*sumX) / n           // intercept

  const forecasts: number[] = []
  for (let k=1;k<=months;k++){
    const x = n-1 + k
    forecasts.push(a*x + b)
  }

  return c.json({ months, history: { months: monthsKeys, values: series }, forecast: forecasts })
})

// POST /api/import/csv  (CSV text in body)
// Expected headers: date,type,amount,company_id,description?
app.post('/api/import/csv', async (c) => {
  const text = await c.req.text()
  const rows = parseCSV(text)
  if (rows.length < 2) return c.json({ insertedCount: 0 })

  const [header, ...data] = rows
  const idx = (name: string) => header.findIndex(h => h.trim().toLowerCase()===name)

  const iDate = idx('date')
  const iType = idx('type')
  const iAmount = idx('amount')
  const iCompany = idx('company_id')
  const iDesc = idx('description')

  const docs = data.map(cols => ({
    date: cols[iDate]?.trim(),
    type: String(cols[iType]||'').toLowerCase(),
    amount: Number(cols[iAmount]||0),
    company_id: cols[iCompany]?.trim(),
    description: cols[iDesc]?.trim() || null,
    created_at: new Date().toISOString()
  })).filter(d => d.date && d.type && !Number.isNaN(d.amount) && d.company_id)

  if (docs.length === 0) return c.json({ insertedCount: 0 })

  const res = await mongo(c, 'action/insertMany', {
    collection: 'transactions',
    documents: docs
  }) as any

  return c.json({ insertedCount: res?.insertedIds ? res.insertedIds.length : docs.length })
})

export default app
