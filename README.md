# Expense tracker

The source is split into two independent apps: a Cloudflare Worker backend in `backend/` and a local React + Vite dashboard in `dashboard/`.

## Start locally

1. Install dependencies independently in each app:

   ```sh
   cd backend && npm install
   cd ../dashboard && npm install
   ```

2. Apply local D1 migrations, provision scoped development API keys, and configure `backend/.dev.vars` + `dashboard/.env.local`:

   ```sh
   cd backend
   npm run db:setup:local
   ```

3. (Optional) Seed sample VND transactions across `2026-10` and `2026-11`:

   ```sh
   cd backend
   npm run db:seed:demo
   ```

4. Run the Integration Worker (`127.0.0.1:8787`), the Dashboard Worker (`127.0.0.1:8788`, for adding/updating/deleting transactions locally), and the local dashboard (`127.0.0.1:5173`) in separate terminals:

   ```sh
   cd backend && npm run dev
   cd backend && npm run dev:dashboard
   cd dashboard && npm run dev
   ```

   `db:setup:local` configures `backend/.dev.vars` and `EXPENSE_TRACKER_MODE=owner` in `dashboard/.env.local` so the local dashboard supports adding today's transactions and setting monthly income through the local Dashboard Worker. To run in strict read-only mode instead, set `EXPENSE_TRACKER_MODE=readonly` in `dashboard/.env.local`.

   To run the standalone loopback viewer against a production build (`127.0.0.1:4173`), build once and start the server inside `dashboard/`:

   ```sh
   cd dashboard
   npm run build
   npm run serve
   ```

The dashboard keeps API credentials strictly on the local Node/Vite proxy server and only forwards `GET`/`HEAD` routes in `readonly` mode (plus owner `POST`/`PATCH`/`DELETE /v1/transactions` routes against a loopback Dashboard Worker in `owner` mode).

## Verify

```sh
cd backend && npm run check && npm test
cd dashboard && npm run check && npm test && npm run build
```

The product plan, source layout, database schema, API contract, and backend phases are in `docs/`.
