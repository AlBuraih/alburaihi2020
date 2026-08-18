const Database = require('better-sqlite3');
const db = new Database('data.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  currency TEXT,
  token_address TEXT,
  token_decimals INTEGER,
  gross_amount TEXT,
  platform_fee TEXT,
  network_fee_native TEXT,
  net_amount TEXT,
  fee_payer TEXT,
  destination_address TEXT,
  status TEXT,
  tx_hash TEXT,
  created_at TEXT,
  updated_at TEXT,
  failure_reason TEXT
)
`).run();

// Audit table for admin actions
db.prepare(`
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  admin_token TEXT,
  action TEXT,
  withdrawal_id TEXT,
  tx_hash TEXT,
  details TEXT,
  created_at TEXT
)
`).run();

module.exports = db;
