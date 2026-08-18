# Admin UI

Simple React admin UI for the payouts PoC.

Setup:
1. cd payouts-poc/admin
2. npm install
3. Edit `src/App.js` to set ADMIN_TOKEN or configure your build to inject it.
4. npm run build
5. The built static files will be served by the Express server at /admin (if server is configured as in server.js).
