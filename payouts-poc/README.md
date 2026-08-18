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
- Do NOT commit sensitive values (PRIVATE_KEY or ADMIN_JWT_SECRET / ADMIN_USER / ADMIN_PASS) into the repo.
- Preferred: add them as GitHub Actions secrets:
  - `ADMIN_JWT_SECRET` — secret used to sign admin JWTs
  - `ADMIN_USER` — admin username (PoC)
  - `ADMIN_PASS` — admin password (PoC)
  - `PRIVATE_KEY` — platform hot wallet private key (use test key on Mumbai)

Example (gh CLI):
```
# replace <value> with your secret
gh secret set ADMIN_JWT_SECRET --repo AlBuraih/alburaihi2020 --body "<secret>"
gh secret set ADMIN_USER --repo AlBuraih/alburaihi2020 --body "admin"
gh secret set ADMIN_PASS --repo AlBuraih/alburaihi2020 --body "password"
gh secret set PRIVATE_KEY --repo AlBuraih/alburaihi2020 --body "0x..."
```

Or add via: Repo → Settings → Secrets and variables → Actions → New repository secret

### 2) Local .env (for local testing only)
Copy and edit `payouts-poc/.env.example` into `payouts-poc/.env` and fill values (RPC_URL, PRIVATE_KEY, ADMIN_JWT_SECRET, ADMIN_USER, ADMIN_PASS). Example added keys:
```
ADMIN_JWT_SECRET=changeme_jwt_secret
ADMIN_USER=admin
ADMIN_PASS=password
```
Replace `changeme_jwt_secret` with a strong random value (recommended: `openssl rand -hex 32`).

### 3) Admin login flow
- The admin UI now supports username/password login using the endpoint `POST /admin/login` which returns a JWT.
- After login the UI uses the JWT to call admin endpoints (`/admin/withdrawals`, `/admin/audit`, and `/withdrawals/:id/confirm`).

### 4) Build & serve Admin UI
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
3. Open the admin UI at: `http://localhost:3000/admin` and login with the ADMIN_USER/ADMIN_PASS values.

### 5) Admin API examples
- Login to receive JWT:
```
curl -X POST http://localhost:3000/admin/login -H "Content-Type: application/json" -d '{"username":"admin","password":"password"}'
```
- Use returned token in the Authorization header for admin requests:
```
curl -H "Authorization: Bearer <JWT>" "http://localhost:3000/admin/withdrawals?status=pending"
```
- Approve & execute a withdrawal:
```
curl -X POST http://localhost:3000/withdrawals/<id>/confirm -H "Authorization: Bearer <JWT>"
```

### 6) Security notes
- Replace the PoC admin credentials and JWT secret with stronger values and move secrets to your hosting environment's secret store.
- Use HTTPS, add RBAC, and consider SSO/OAuth for production administration.
- Audit logs are recorded in the `admin_audit` table (see `data.db`) for accountability.

---

If you want, I can now:
- provide a ready gh CLI command that sets ADMIN_JWT_SECRET/ADMIN_USER/ADMIN_PASS and PRIVATE_KEY in the repo secrets, or
- tighten the auth to check hashed passwords stored in the DB instead of plaintext env vars, or
- add role-based admin users and a small user-management UI.
