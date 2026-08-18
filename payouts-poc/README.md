# Payouts PoC

PoC service for withdrawals (native + ERC20) with a fixed platform fee and platform covering gas.
Network: Polygon Mumbai (testnet) by default.

Setup:
1. Copy `.env.example` -> `.env` and fill RPC_URL and PRIVATE_KEY (test wallet).
2. npm install
3. npm start

Endpoints:
- POST /withdrawals/create  -> preview (returns id, gross, platform_fee, net, network_fee_native)
- POST /withdrawals/:id/confirm -> execute transfer (platform must have sufficient balances)
- GET /withdrawals/:id -> get status

Security: Use test keys only. Move PRIVATE_KEY to a KMS before production.

---

## Admin UI & Secrets (how-to)

This repository includes a simple Admin UI (React) and a protected admin API. Follow these steps to configure and run it safely.

### 1) Set secrets (recommended: GitHub Secrets)
- Do NOT commit sensitive values (PRIVATE_KEY or ADMIN_TOKEN) into the repo.
- Preferred: add them as GitHub Actions secrets:
  - `ADMIN_TOKEN` — secret used to authorize admin requests
  - `PRIVATE_KEY` — platform hot wallet private key (use test key on Mumbai)

Example (gh CLI):
```
# replace <value> with your secret
gh secret set ADMIN_TOKEN --repo AlBuraih/alburaihi2020 --body "0x..."
gh secret set PRIVATE_KEY --repo AlBuraih/alburaihi2020 --body "0x..."
```

Or add via: Repo → Settings → Secrets and variables → Actions → New repository secret

### 2) Local .env (for local testing only)
Copy and edit `payouts-poc/.env.example` into `payouts-poc/.env` and fill values (RPC_URL, PRIVATE_KEY, ADMIN_TOKEN). Example added keys:
```
ADMIN_TOKEN=changeme
```
Replace `changeme` with a strong random value (recommended: `openssl rand -hex 32`).

### 3) Build & serve Admin UI
1. Build the admin React app (creates `payouts-poc/admin/build`):
   ```bash
   cd payouts-poc/admin
   npm install
   npm run build
   ```
2. Start the server (server serves `/admin` statically):
   ```bash
   cd ../
   npm install
   npm start
   ```
3. Open the admin UI at: `http://localhost:3000/admin` and authenticate requests using the `ADMIN_TOKEN` header.

### 4) Admin API examples
- List pending withdrawals (use Authorization header):
```
curl -H "Authorization: Bearer <ADMIN_TOKEN>" "http://localhost:3000/admin/withdrawals?status=pending"
```
- Approve & execute a withdrawal (server endpoint):
```
curl -X POST http://localhost:3000/withdrawals/<id>/confirm -H "Authorization: Bearer <ADMIN_TOKEN>"
```

### 5) Security notes
- Replace the PoC admin token with a proper auth system (OAuth2/SSO, JWT, or at least password+2FA) before production.
- Use KMS/HSM for signing keys in production; do not store real private keys in environment files in the repo.
- Add audit logging for admin actions (who approved, when, txHash).

---

If you want, I can:
- add the README changes above to the repo (done),
- generate a strong ADMIN_TOKEN for you (and optionally set it as a GitHub secret if you provide permission),
- or add an “audit log” table and UI page that records admin actions.
