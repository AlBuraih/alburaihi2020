const Database = require('better-sqlite3');
const db = new Database('clicker-data.db');

// users
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at TEXT
)
`).run();

// wallets (USDC units as string decimal)
db.prepare(`
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  balance TEXT DEFAULT '0',
  locked TEXT DEFAULT '0'
)
`).run();

// rounds (game sessions)
db.prepare(`
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  clicks INTEGER,
  duration INTEGER,
  reward TEXT,
  status TEXT,
  started_at TEXT,
  submitted_at TEXT
)
`).run();

// withdrawals
db.prepare(`
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  amount TEXT,
  destination TEXT,
  fee TEXT,
  status TEXT,
  tx_hash TEXT,
  created_at TEXT,
  updated_at TEXT
)
`).run();

// admin audit
db.prepare(`
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  actor TEXT,
  action TEXT,
  target_id TEXT,
  details TEXT,
  created_at TEXT
)
`).run();

module.exports = db;
