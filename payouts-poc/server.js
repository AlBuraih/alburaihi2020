require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { ethers } = require('ethers');
const path = require('path');
const jwt = require('jsonwebtoken');

const db = require('./db');
const {
  createProvider, createWallet,
  estimateNativeNetworkFee, estimateERC20NetworkFee,
  sendNative, sendERC20
} = require('./payouts');

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PORT = process.env.PORT || 3000;

const PLATFORM_FEE_NATIVE = process.env.PLATFORM_FEE_NATIVE || '0.5';
const PLATFORM_FEE_TOKEN = process.env.PLATFORM_FEE_TOKEN || '1';
const USDC_TOKEN_ADDRESS = process.env.USDC_TOKEN_ADDRESS || null;
const USDC_TOKEN_DECIMALS = parseInt(process.env.USDC_TOKEN_DECIMALS || '6', 10);

// Admin token (legacy PoC support)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';
// Username/password + JWT for admins (PoC defaults)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'changeme_jwt_secret';
const ADMIN_JWT_EXPIRES = process.env.ADMIN_JWT_EXPIRES || '1h';

const provider = createProvider(RPC_URL);
const wallet = createWallet(PRIVATE_KEY, provider);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Simple admin auth middleware (accepts legacy ADMIN_TOKEN or JWT)
function adminAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);

  // legacy token support
  if (token === ADMIN_TOKEN) {
    req.admin = { token, username: 'legacy-token' };
    return next();
  }

  // try JWT
  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    req.admin = { token, username: payload.username };
    return next();
  } catch (e) {
    return res.status(403).json({ error: 'Forbidden' });
  }
}

// helper: log audit
function logAudit(adminTokenOrUser, action, withdrawalId, txHash, details) {
  try {
    const now = new Date().toISOString();
    const id = uuidv4();
    db.prepare(`INSERT INTO admin_audit (id, admin_token, action, withdrawal_id, tx_hash, details, created_at) VALUES (@id,@admin_token,@action,@withdrawal_id,@tx_hash,@details,@created_at)`).run({
      id, admin_token: adminTokenOrUser, action, withdrawal_id: withdrawalId, tx_hash: txHash || null, details: details || null, created_at: now
    });
  } catch (e) {
    console.error('audit log failed', e);
  }
}

// Serve admin static build if present
app.use('/admin', express.static(path.join(__dirname, 'admin', 'build')));

// Admin login: username/password -> returns JWT
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ username }, ADMIN_JWT_SECRET, { expiresIn: ADMIN_JWT_EXPIRES });
  return res.json({ token, expiresIn: ADMIN_JWT_EXPIRES });
});

function insertWithdrawal(obj) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT INTO withdrawals (
    id, user_id, currency, token_address, token_decimals, gross_amount, platform_fee,
    network_fee_native, net_amount, fee_payer, destination_address, status, created_at, updated_at
  ) VALUES (@id,@user_id,@currency,@token_address,@token_decimals,@gross_amount,@platform_fee,@network_fee_native,@net_amount,@fee_payer,@destination_address,@status,@created_at,@updated_at)`);
  obj.created_at = now;
  obj.updated_at = now;
  stmt.run(obj);
}

// Admin endpoint: list withdrawals (optional filter by status)
app.get('/admin/withdrawals', adminAuth, (req, res) => {
  const status = req.query.status || null;
  let rows;
  if (status) rows = db.prepare('SELECT * FROM withdrawals WHERE status = ? ORDER BY created_at DESC').all(status);
  else rows = db.prepare('SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 200').all();
  res.json(rows);
});

// Admin endpoint: audit log
app.get('/admin/audit', adminAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 500').all();
  res.json(rows);
});

app.post('/withdrawals/create', async (req, res) => {
  try {
    const { userId, currency, amount, tokenAddress, destination } = req.body;
    if (!userId || !currency || !amount || !destination) {
      return res.status(400).json({ error: 'userId, currency, amount, destination required' });
    }

    if (currency === 'native') {
      const platformFee = PLATFORM_FEE_NATIVE;
      const gross = amount;
      const grossBn = ethers.parseEther(gross);
      const platformFeeBn = ethers.parseEther(platformFee);
      if (grossBn <= platformFeeBn) {
        return res.status(400).json({ error: 'Amount too small after platform fee' });
      }
      const netBn = grossBn - platformFeeBn;
      const netHuman = ethers.formatEther(netBn);

      const est = await estimateNativeNetworkFee(provider, destination, netHuman);
      const id = uuidv4();
      insertWithdrawal({
        id, user_id: userId, currency, token_address: null, token_decimals: null,
        gross_amount: gross, platform_fee: platformFee, network_fee_native: est.networkFeeWei,
        net_amount: netHuman, fee_payer: 'platform', destination_address: destination,
        status: 'pending'
      });

      return res.json({
        id, gross: gross, platform_fee: platformFee, net: netHuman, network_fee_native: est.networkFeeWei
      });
    } else if (currency === 'erc20') {
      const tokenAddr = tokenAddress || USDC_TOKEN_ADDRESS;
      const tokenDecimals = USDC_TOKEN_DECIMALS;
      if (!tokenAddr) return res.status(400).json({ error: 'tokenAddress required for erc20' });

      const platformFee = PLATFORM_FEE_TOKEN;
      const amountUnits = ethers.parseUnits(amount, tokenDecimals);
      const feeUnits = ethers.parseUnits(platformFee, tokenDecimals);
      if (amountUnits <= feeUnits) {
        return res.status(400).json({ error: 'Amount too small after platform fee' });
      }
      const netUnits = amountUnits - feeUnits;
      const netHuman = ethers.formatUnits(netUnits, tokenDecimals);

      const est = await estimateERC20NetworkFee(provider, tokenAddr, destination, netUnits, wallet);

      const id = uuidv4();
      insertWithdrawal({
        id, user_id: userId, currency, token_address: tokenAddr, token_decimals: tokenDecimals,
        gross_amount: amount, platform_fee: platformFee, network_fee_native: est.networkFeeWei,
        net_amount: netHuman, fee_payer: 'platform', destination_address: destination,
        status: 'pending'
      });

      return res.json({
        id, gross: amount, platform_fee: platformFee, net: netHuman, network_fee_native: est.networkFeeWei, token_address: tokenAddr
      });
    } else {
      return res.status(400).json({ error: 'currency must be "native" or "erc20"' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

// Require adminAuth for confirm so we can audit who approved/executed
app.post('/withdrawals/:id/confirm', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const performedBy = req.admin && (req.admin.username || req.admin.token) ? (req.admin.username || req.admin.token) : 'unknown';

    const row = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'withdrawal not found' });
    if (row.status !== 'pending') return res.status(400).json({ error: 'withdrawal not pending' });

    // log attempt
    logAudit(performedBy, 'approve_attempt', id, null, JSON.stringify({ ip: req.ip }));

    db.prepare('UPDATE withdrawals SET status = ?, updated_at = ? WHERE id = ?').run('approved', new Date().toISOString(), id);

    if (row.currency === 'native') {
      const netHuman = row.net_amount;
      const nativeBalance = await provider.getBalance(wallet.address);
      const netWei = ethers.parseEther(netHuman);
      const networkFeeWei = BigInt(row.network_fee_native);
      if (nativeBalance < (netWei + networkFeeWei)) {
        db.prepare('UPDATE withdrawals SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?')
          .run('failed', 'insufficient platform native balance', new Date().toISOString(), id);
        logAudit(performedBy, 'execute_failed', id, null, 'insufficient platform native balance');
        return res.status(400).json({ error: 'platform wallet has insufficient native balance for send + gas' });
      }

      const { txHash } = await sendNative(provider, wallet, row.destination_address, netHuman);
      db.prepare('UPDATE withdrawals SET status = ?, tx_hash = ?, updated_at = ? WHERE id = ?')
        .run('broadcast', txHash, new Date().toISOString(), id);

      db.prepare('UPDATE withdrawals SET status = ?, updated_at = ? WHERE id = ?')
        .run('confirmed', new Date().toISOString(), id);

      logAudit(performedBy, 'execute', id, txHash, 'native executed');

      const updated = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
      return res.json({ id, txHash, status: updated.status });
    } else {
      const tokenAddr = row.token_address;
      const decimals = row.token_decimals;
      const netHuman = row.net_amount;
      const netUnits = ethers.parseUnits(netHuman, decimals);

      const ERC20_ABI = [
        "function decimals() view returns (uint8)",
        "function balanceOf(address) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)"
      ];
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
      const tokenBalance = await token.balanceOf(wallet.address);
      const grossUnits = ethers.parseUnits(row.gross_amount, decimals);
      if (tokenBalance < grossUnits) {
        db.prepare('UPDATE withdrawals SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?')
          .run('failed', 'insufficient platform token balance', new Date().toISOString(), id);
        logAudit(performedBy, 'execute_failed', id, null, 'insufficient platform token balance');
        return res.status(400).json({ error: 'platform wallet has insufficient token balance' });
      }

      const nativeBalance = await provider.getBalance(wallet.address);
      const networkFeeWei = BigInt(row.network_fee_native);
      if (nativeBalance < networkFeeWei) {
        db.prepare('UPDATE withdrawals SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?')
          .run('failed', 'insufficient native for gas', new Date().toISOString(), id);
        logAudit(performedBy, 'execute_failed', id, null, 'insufficient native for gas');
        return res.status(400).json({ error: 'platform wallet has insufficient native balance for gas' });
      }

      const { txHash } = await sendERC20(provider, wallet, tokenAddr, row.destination_address, netUnits);
      db.prepare('UPDATE withdrawals SET status = ?, tx_hash = ?, updated_at = ? WHERE id = ?')
        .run('broadcast', txHash, new Date().toISOString(), id);

      db.prepare('UPDATE withdrawals SET status = ?, updated_at = ? WHERE id = ?')
        .run('confirmed', new Date().toISOString(), id);

      logAudit(performedBy, 'execute', id, txHash, 'erc20 executed');

      const updated = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
      return res.json({ id, txHash, status: updated.status });
    }
  } catch (err) {
    console.error(err);
    db.prepare('UPDATE withdrawals SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?')
      .run('failed', String(err), new Date().toISOString(), req.params.id);
    logAudit(req.admin && (req.admin.username || req.admin.token) ? (req.admin.username || req.admin.token) : 'unknown', 'execute_error', req.params.id, null, String(err));
    return res.status(500).json({ error: String(err) });
  }
});

app.get('/withdrawals/:id', (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not found' });
  return res.json(row);
});

app.listen(PORT, () => {
  console.log(`Payouts PoC server running on port ${PORT}`);
});
