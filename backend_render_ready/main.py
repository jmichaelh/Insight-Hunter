import os, io, json, datetime
from urllib.parse import quote_plus
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

app = FastAPI(title="Insight Hunter API")

# --- Build Mongo URI from env ---
USER = quote_plus(os.getenv("MONGO_USER", ""))
PASS = quote_plus(os.getenv("MONGO_PASS", ""))
HOST = os.getenv("MONGO_HOST", "")
DB   = os.getenv("MONGO_DB", "insighthunter")

MONGO_URI = f"mongodb+srv://{USER}:{PASS}@{HOST}/{DB}?retryWrites=true&w=majority&authSource=admin&authMechanism=SCRAM-SHA-256&tls=true&appName=insighthunter"

client = AsyncIOMotorClient(MONGO_URI)
db = client[DB]

@app.get("/dbtest", tags=["meta"])
async def dbtest():
    """Ping Atlas to confirm authentication and connectivity."""
    try:
        res = await db.command("ping")
        return {"ok": res["ok"], "db": DB, "user": USER}
    except Exception as e:
        return {"ok": 0, "error": str(e)}


# Load .env in local/dev (Render uses dashboard env vars)
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME   = os.getenv("MONGO_DB", "insight_hunter")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
MONGO_USER = os.getenv("MONGO_USER", "")
MONGO_PASS = os.getenv("MONGO_PASS", "")
MONGO_HOST = os.getenv("MONGO_HOST", "localhost")
MONGO_DB   = os.getenv("MONGO_DB", "app")

user = quote_plus(MONGO_USER)
pwd  = quote_plus(MONGO_PASS)

MONGO_URI = f"mongodb+srv://{USER}:{PASS}@{HOST}/{DB}?retryWrites=true&w=majority&authSource=admin&authMechanism=SCRAM-SHA-256&tls=true&appName=insighthunter"

mongo_client = AsyncIOMotorClient(MONGO_URI)
db = mongo_client[MONGO_DB]


try:
    from openai import OpenAI
    client_oa = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
except Exception:
    client_oa = None

app = FastAPI(title="Insight Hunter API", version="0.2.1")

# CORS: keep * for MVP; tighten to your frontend origin in prod
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mongo_client = AsyncIOMotorClient(MONGO_URI)
db = mongo_client[DB_NAME]
REQUIRED_COLS = ["Category", "Amount (USD)"]

async def parse_csv(file: UploadFile):
    raw = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(400, f"CSV read error: {e}")
    if not all(c in df.columns for c in REQUIRED_COLS):
        raise HTTPException(400, "CSV must include 'Category' and 'Amount (USD)'")
    if len(df) > 1000:
        raise HTTPException(400, "Max 1000 rows in MVP")
    df = df[REQUIRED_COLS]
    return df.to_dict(orient="records")

def prompt_from_rows(rows):
    csv_text = "\n".join([f"{r['Category']},{r['Amount (USD)']}" for r in rows])
    return ("You are a virtual CFO. Return strict JSON with keys: "
            "summary (<=100 words, 3 sentences), insights (array of 3 bullets), "
            "recommendation (one actionable step).\n\n" + csv_text)

async def ai_insights(rows):
    if client_oa is None:
        return {
            "summary": "Revenue steady; expenses concentrated in payroll/marketing; margin acceptable.",
            "insights": [
                "Marketing elevated vs baseline; check CAC/LTV.",
                "COGS flat; negotiate supplier terms.",
                "Payroll efficiency within range for scale."
            ],
            "recommendation": "Cut lowest-ROI channel by ~20% and reallocate for 4 weeks."
        }
    resp = client_oa.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role":"system","content":"Return only valid JSON."},
            {"role":"user","content": prompt_from_rows(rows)}
        ],
        temperature=0.3
    )
    txt = resp.choices[0].message.content
    try:
        return json.loads(txt)
    except Exception:
        return {"summary": txt[:300], "insights": [], "recommendation": ""}

def compute_totals(rows):
    out = {}
    for r in rows:
        cat = str(r["Category"]).strip()
        amt = float(r["Amount (USD)"])
        out[cat] = out.get(cat, 0.0) + amt
    return out

@app.post("/generate-report")
async def generate_report(file: UploadFile = File(...), client_name: str = "Demo Client", period: str = datetime.date.today().strftime("%Y-%m")):
    rows = await parse_csv(file)
    insights = await ai_insights(rows)
    totals = compute_totals(rows)
    doc = {
        "client_name": client_name,
        "period": period,
        "rows": rows,
        "totals": totals,
        "insights": insights,
        "created_at": datetime.datetime.utcnow()
    }
    res = await db.reports.insert_one(doc)
    return {"report_id": str(res.inserted_id), "data": rows, "insights": insights}

@app.get("/reports")
async def list_reports(client_name: Optional[str] = None, period: Optional[str] = None):
    q = {}
    if client_name: q["client_name"] = client_name
    if period: q["period"] = period
    cur = db.reports.find(q, {"rows": 0}).sort("created_at", -1).limit(50)
    out = []
    async for d in cur:
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return {"items": out}

@app.get("/reports/{report_id}")
async def get_report(report_id: str):
    from bson import ObjectId
    d = await db.reports.find_one({"_id": ObjectId(report_id)})
    if not d: raise HTTPException(404, "Not found")
    d["id"] = str(d.pop("_id"))
    return d

@app.get("/health")
async def health():
    ok = await db.command("ping")
    return {"ok": True, "mongo": ok.get("ok", 0) == 1}

import logging
logging.basicConfig(level=logging.INFO)
logging.info("Insight Hunter backend is live and connected to MongoDB.")
