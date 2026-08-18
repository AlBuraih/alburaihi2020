# Clicker PoC

Simple clicker game PoC that credits USDC rewards based on clicks. Includes basic auth, server‑authoritative rounds, internal wallet ledger, withdraw request flow and admin confirmation.

Run locally:

1. cd clicker-poc
2. npm install
3. create .env with (optional):
   JWT_SECRET=your_jwt_secret
   ADMIN_TOKEN=your_admin_token
   PORT=4000
4. npm start
5. Open http://localhost:4000/

Admin endpoints (use ADMIN_TOKEN as Bearer token):
- GET /admin/withdrawals
- POST /admin/withdrawals/:id/confirm
- GET /admin/audit

Notes:
- This is a PoC. On-chain payouts are simulated with a fake txHash when admin confirms a withdrawal. To integrate real on‑chain transfers, implement signing and broadcasting via a safe custody wallet or a payments provider.
- Anti‑cheat is basic. Improve with server event logging and behavioral heuristics for production.

