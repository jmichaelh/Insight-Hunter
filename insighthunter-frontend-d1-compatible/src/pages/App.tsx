import React, { useMemo, useState } from 'react'
import { API_BASE } from '../config'

export default function App(){
  const [companyId, setCompanyId] = useState('demo-co')
  const [start, setStart] = useState('2025-01-01')
  const [end, setEnd] = useState('2025-06-30')
  const [report, setReport] = useState<any>(null)
  const [forecast, setForecast] = useState<any>(null)
  const [status, setStatus] = useState<string>('')

  const [csv, setCsv] = useState<string>(
`date,type,amount,company_id,description
2025-01-03,revenue,5000,demo-co,invoice 1001
2025-01-09,cogs,1200,demo-co,materials
2025-01-15,opex,900,demo-co,rent
2025-02-06,revenue,6000,demo-co,invoice 1010
2025-02-10,cogs,1500,demo-co,materials
2025-02-19,opex,950,demo-co,utilities`)

  const api = useMemo(()=>API_BASE.replace(/\/$/,'') , [])

  async function call(path: string, init?: RequestInit){
    setStatus('Loading...')
    try{
      const res = await fetch(api + path, init)
      if(!res.ok) throw new Error(res.status + ' ' + (await res.text()))
      const data = await res.json()
      setStatus('OK')
      return data
    }catch(e:any){
      setStatus('Error: ' + e.message)
      return null
    }
  }

  async function onImport(){
    await call('/api/import/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: csv
    })
  }

  async function onReport(){
    const data = await call('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, start, end })
    })
    setReport(data)
  }

  async function onForecast(){
    const data = await call(`/api/cashflow/forecast?companyId=${encodeURIComponent(companyId)}&months=6`)
    setForecast(data)
  }

  return (
    <div style={{maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, sans-serif'}}>
      <h1>Insight Hunter</h1>
      <p><b>Status:</b> {status}</p>

      <section style={{marginBottom: 24}}>
        <h2>1) Configure</h2>
        <div style={{display:'grid', gridTemplateColumns:'150px 1fr', gap:12}}>
          <label>API Base</label><div>{api}</div>
          <label>Company ID</label><input value={companyId} onChange={e=>setCompanyId(e.target.value)} />
          <label>Start</label><input type="date" value={start} onChange={e=>setStart(e.target.value)} />
          <label>End</label><input type="date" value={end} onChange={e=>setEnd(e.target.value)} />
        </div>
      </section>

      <section style={{marginBottom: 24}}>
        <h2>2) Import CSV</h2>
        <textarea value={csv} onChange={e=>setCsv(e.target.value)} rows={8} style={{width:'100%'}}/>
        <div><button onClick={onImport}>Import</button></div>
      </section>

      <section style={{marginBottom: 24}}>
        <h2>3) Generate Report</h2>
        <button onClick={onReport}>Run</button>
        {report && (
          <pre>{JSON.stringify(report, null, 2)}</pre>
        )}
      </section>

      <section style={{marginBottom: 24}}>
        <h2>4) Forecast</h2>
        <button onClick={onForecast}>Run</button>
        {forecast && (
          <pre>{JSON.stringify(forecast, null, 2)}</pre>
        )}
      </section>
    </div>
  )
}
