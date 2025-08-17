
import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Env = { DB: D1Database }

const app = new Hono<{ Bindings: Env }>()
app.use('/*', cors())

app.get('/health', (c) => c.json({ ok: true, service: 'insight-hunter-api-d1' }))

app.get('/api/transactions/:companyId', async (c) => {
  const companyId = c.req.param('companyId')
  const { results } = await c.env.DB.prepare(
    `SELECT id, company_id, date, type, amount, description FROM transactions
     WHERE company_id = ? ORDER BY date ASC`
  ).bind(companyId).all()
  return c.json(results || [])
})

app.post('/api/reports/generate', async (c) => {
  const { companyId, start, end } = await c.req.json()

  const rev = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount),0) as s FROM transactions
     WHERE company_id=? AND type='revenue' AND date BETWEEN ? AND ?`
  ).bind(companyId, start, end).first('s') || 0

  const cogs = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount),0) as s FROM transactions
     WHERE company_id=? AND type='cogs' AND date BETWEEN ? AND ?`
  ).bind(companyId, start, end).first('s') || 0

  const opex = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount),0) as s FROM transactions
     WHERE company_id=? AND type='opex' AND date BETWEEN ? AND ?`
  ).bind(companyId, start, end).first('s') || 0

  const gp = Number(rev) - Number(cogs)
  const net = gp - Number(opex)

  const id = crypto.randomUUID?.() || (Math.random().toString(36).slice(2))
  await c.env.DB.prepare(
    `INSERT INTO reports (id, company_id, period_start, period_end, revenue, cogs, gp, opex, net)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, companyId, start, end, rev, cogs, gp, opex, net).run()

  return c.json({ id, companyId, period_start: start, period_end: end, revenue: rev, cogs, gp, opex, net })
})

app.get('/api/cashflow/forecast', async (c) => {
  const url = new URL(c.req.url)
  const companyId = url.searchParams.get('companyId') || 'demo-co'
  const months = Number(url.searchParams.get('months') || '6')

  const { results } = await c.env.DB.prepare(
    `SELECT substr(date,1,7) as ym,
            SUM(CASE WHEN type='revenue' THEN amount ELSE 0 END) as rev,
            SUM(CASE WHEN type IN ('cogs','opex') THEN amount ELSE 0 END) as out
     FROM transactions
     WHERE company_id=?
     GROUP BY substr(date,1,7)
     ORDER BY ym ASC`
  ).bind(companyId).all()

  const monthsKeys = (results || []).map((r:any) => r.ym as string)
  const series = (results || []).map((r:any) => Number(r.rev) - Number(r.out))

  const n = series.length
  let sumX=0, sumY=0, sumXY=0, sumXX=0
  for (let i=0;i<n;i++){ sumX+=i; sumY+=series[i]; sumXY+=i*series[i]; sumXX+=i*i }
  const denom = n*sumXX - sumX*sumX || 1
  const a = (n*sumXY - sumX*sumY) / denom
  const b = (sumY - a*sumX) / n

  const forecasts: number[] = []
  for (let k=1;k<=months;k++){
    const x = n-1 + k
    forecasts.push(a*x + b)
  }

  return c.json({ months, history: { months: monthsKeys, values: series }, forecast: forecasts })
})

app.post('/api/import/csv', async (c) => {
  const text = await c.req.text()
  const rows = parseCSV(text)
  if (rows.length < 2) return c.json({ insertedCount: 0 })

  const [header, ...data] = rows
  const idx = (name: string) => header.findIndex((h:string) => h.trim().toLowerCase()===name)

  const iDate = idx('date')
  const iType = idx('type')
  const iAmount = idx('amount')
  const iCompany = idx('company_id')
  const iDesc = idx('description')

  let inserted = 0
  const stmt = c.env.DB.prepare(
    `INSERT INTO transactions (id, company_id, date, type, amount, description)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  for (const cols of data){
    const date = cols[iDate]?.trim()
    const type = String(cols[iType]||'').toLowerCase()
    const amount = Number(cols[iAmount]||0)
    const company = cols[iCompany]?.trim() || 'demo-co'
    const description = cols[iDesc]?.trim() || null
    if (!date || !type || Number.isNaN(amount)) continue

    const id = crypto.randomUUID?.() || (Math.random().toString(36).slice(2))
    await stmt.bind(id, company, date, type, amount, description).run()
    inserted++
  }
  return c.json({ insertedCount: inserted })
})

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

export default app
