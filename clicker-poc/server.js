require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_clicker_jwt';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme_admin_token';

function now(){ return new Date().toISOString(); }

// helpers
function createUser(id, email, passwordHash){
  const created_at = now();
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?,?,?,?)').run(id,email,passwordHash,created_at);
  db.prepare('INSERT OR REPLACE INTO wallets (user_id, balance, locked) VALUES (?,"0","0")').run(id);
}

function getUserByEmail(email){
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function getUserById(id){
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getWallet(userId){
  return db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
}

function updateWalletBalance(userId, newBalance){
  return db.prepare('UPDATE wallets SET balance = ? WHERE user_id = ?').run(newBalance, userId);
}

// auth
app.post('/auth/register', async (req,res)=>{
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'email and password required' });
  if(getUserByEmail(email)) return res.status(400).json({ error: 'email exists' });
  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  createUser(id, email, hash);
  const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token });
});

app.post('/auth/login', async (req,res)=>{
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = getUserByEmail(email);
  if(!user) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if(!ok) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token });
});

function requireAuth(req,res,next){
  const auth = req.headers['authorization']||'';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  }catch(e){
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req,res,next){
  const auth = req.headers['authorization']||'';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  if(token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  req.admin = { token };
  next();
}

// game: start round
app.post('/game/start', requireAuth, (req,res)=>{
  const id = uuidv4();
  const user_id = req.user.id;
  const started_at = now();
  db.prepare('INSERT INTO rounds (id,user_id,clicks,duration,reward,status,started_at) VALUES (?,?,?,?,?,?,?)')
    .run(id,user_id,0,0,'0','started',started_at);
  return res.json({ roundId: id, started_at, duration: 60 });
});

// submit round
app.post('/game/submit', requireAuth, (req,res)=>{
  try{
    const { roundId, clicks, duration } = req.body || {};
    if(!roundId || typeof clicks !== 'number' || typeof duration !== 'number') return res.status(400).json({ error: 'roundId, clicks, duration required' });
    const row = db.prepare('SELECT * FROM rounds WHERE id = ?').get(roundId);
    if(!row) return res.status(404).json({ error: 'round not found' });
    if(row.user_id !== req.user.id) return res.status(403).json({ error: 'not your round' });
    if(row.status !== 'started') return res.status(400).json({ error: 'round already submitted' });

    // basic server-side validation
    const started = new Date(row.started_at);
    const nowTime = new Date();
    const elapsed = (nowTime - started)/1000;
    if(elapsed > 120) return res.status(400).json({ error: 'round expired' });
    if(duration > 120 || duration < 0) return res.status(400).json({ error: 'invalid duration' });
    // clicks plausibility: max 50 CPS
    const maxClicks = Math.ceil(duration * 50);
    if(clicks < 0 || clicks > maxClicks) return res.status(400).json({ error: 'invalid clicks (anti-cheat)' });

    // reward formula: 1000 clicks = 0.1 USDC (configurable)
    const rewardUSDC = (clicks / 1000) * 0.1;
    const rewardStr = rewardUSDC.toFixed(6); // store as decimal string

    db.prepare('UPDATE rounds SET clicks = ?, duration = ?, reward = ?, status = ?, submitted_at = ? WHERE id = ?')
      .run(clicks, duration, rewardStr, 'submitted', now(), roundId);

    // credit user wallet
    const wallet = getWallet(req.user.id);
    const newBalance = (parseFloat(wallet.balance || '0') + parseFloat(rewardStr)).toFixed(6);
    updateWalletBalance(req.user.id, newBalance);

    return res.json({ reward: rewardStr, balance: newBalance });
  }catch(e){
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
});

// get profile
app.get('/me', requireAuth, (req,res)=>{
  const user = getUserById(req.user.id);
  const wallet = getWallet(req.user.id);
  return res.json({ user: { id: user.id, email: user.email, created_at: user.created_at }, wallet });
});

// create withdrawal request
app.post('/withdrawals/create', requireAuth, (req,res)=>{
  const { amount, destination } = req.body || {};
  if(!amount || !destination) return res.status(400).json({ error: 'amount and destination required' });
  const wallet = getWallet(req.user.id);
  const balance = parseFloat(wallet.balance || '0');
  const amt = parseFloat(amount);
  if(amt <= 0) return res.status(400).json({ error: 'invalid amount' });
  if(amt > balance) return res.status(400).json({ error: 'insufficient balance' });

  // lock amount
  const newBalance = (balance - amt).toFixed(6);
  const newLocked = (parseFloat(wallet.locked || '0') + amt).toFixed(6);
  db.prepare('UPDATE wallets SET balance = ?, locked = ? WHERE user_id = ?').run(newBalance, newLocked, req.user.id);

  const id = uuidv4();
  const fee = (0.5).toFixed(6); // fixed fee 0.5 USDC
  const created_at = now();
  db.prepare('INSERT INTO withdrawals (id,user_id,amount,destination,fee,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.user.id, amt.toFixed? amt.toFixed(6): String(amt), destination, fee, 'pending', created_at, created_at);

  return res.json({ id, amount: amt, fee, status: 'pending' });
});

// admin list withdrawals
app.get('/admin/withdrawals', requireAdmin, (req,res)=>{
  const rows = db.prepare('SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 500').all();
  return res.json(rows);
});

// admin confirm withdrawal (this PoC does not broadcast on-chain; it simulates txHash)
app.post('/admin/withdrawals/:id/confirm', requireAdmin, (req,res)=>{
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
  if(!row) return res.status(404).json({ error: 'withdrawal not found' });
  if(row.status !== 'pending') return res.status(400).json({ error: 'not pending' });

  // mark broadcast/completed and decrement locked
  const txHash = 'POC_TX_' + uuidv4().slice(0,8);
  db.prepare('UPDATE withdrawals SET status = ?, tx_hash = ?, updated_at = ? WHERE id = ?')
    .run('completed', txHash, now(), id);

  // reduce locked
  const wallet = getWallet(row.user_id);
  const newLocked = (parseFloat(wallet.locked || '0') - parseFloat(row.amount)).toFixed(6);
  db.prepare('UPDATE wallets SET locked = ? WHERE user_id = ?').run(newLocked, row.user_id);

  // audit
  const auditId = uuidv4();
  db.prepare('INSERT INTO admin_audit (id,actor,action,target_id,details,created_at) VALUES (?,?,?,?,?,?)')
    .run(auditId, 'admin', 'withdraw_confirm', id, JSON.stringify({ txHash }), now());

  return res.json({ id, txHash, status: 'completed' });
});

// admin audit
app.get('/admin/audit', requireAdmin, (req,res)=>{
  const rows = db.prepare('SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 500').all();
  return res.json(rows);
});

app.listen(PORT, ()=>{
  console.log(`Clicker PoC server running on port ${PORT}`);
});
