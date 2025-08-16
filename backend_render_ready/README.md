# Insight Hunter — Render-Ready Backend (MongoDB)

## Quick deploy (Render)
1) Push this folder to GitHub (private or public).
2) In Render: New → Web Service → connect repo.
3) Build command: `pip install -r requirements.txt`
4) Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5) Set env vars:
   - `MONGO_URI` = your Atlas URI
   - `MONGO_DB` = insight_hunter
   - `OPENAI_API_KEY` (optional)
6) Deploy → test `/health` and `/docs`.

## Local run
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export MONGO_URI="mongodb://localhost:27017"
export MONGO_DB="insight_hunter"
# optional:
export OPENAI_API_KEY="sk-..."
uvicorn main:app --reload --port 10000
```
Open http://localhost:10000/docs
