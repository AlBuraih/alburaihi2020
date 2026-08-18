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
