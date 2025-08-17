
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT CHECK(type IN ('revenue','cogs','opex')) NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  revenue REAL NOT NULL,
  cogs REAL NOT NULL,
  gp REAL NOT NULL,
  opex REAL NOT NULL,
  net REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO companies (id, name) VALUES ('demo-co', 'Demo Company');
