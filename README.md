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

## Deploy the private dashboard to Cloudflare

1. Install dependencies in `backend/` and `dashboard/` with `npm ci`, then run `npm run build` in `dashboard/`.
2. In `backend/`, run `npx wrangler login` and `npx wrangler whoami` to confirm you are using the intended Cloudflare account. If you're new to Workers, set up your account's `workers.dev` subdomain in Workers & Pages. [Cloudflare Worker URLs](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
3. Run `npx wrangler d1 create expense-tracker-production`. If the production database already exists, use its existing ID. Copy `wrangler.production.example.jsonc` to `wrangler.production.jsonc`, then replace the placeholder `database_id` with the production D1 ID. Apply the migrations and deploy from `backend/`. [Cloudflare D1 commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/)

   ```sh
   npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
   npx wrangler deploy --config wrangler.production.jsonc
   ```

4. In Cloudflare, enable Zero Trust if needed. Open the deployed Worker's **Access** tab, protect **All traffic**, and configure an **Allow** policy for your exact email address. Select **One-time PIN** as the login method if you want email codes. The dashboard and ledger require a valid owner session, so the first deploy will deny those requests until Access and the Worker variables are configured. [Worker Access setup](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) · [Email PIN setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
5. In the Worker's **Settings → Variables and Secrets**, add `CF_ACCESS_TEAM_DOMAIN` as `<team>.cloudflareaccess.com` (hostname only), `CF_ACCESS_AUD` as the Access application's audience tag, and `OWNER_EMAIL` as the email in the Allow policy. Wrangler preserves these dashboard-managed variables on subsequent deploys. [Finding the application audience](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/#get-your-aud-tag)
6. Open the printed `workers.dev` URL in a private window. Confirm it prompts for sign-in, then sign in, add a test transaction, and reload to confirm it persisted. A fresh production database starts with the default categories. The migration commands do not copy local transactions or development keys.

## Verify

```sh
cd backend && npm run check && npm test
cd dashboard && npm run check && npm test && npm run build
```

The product plan, source layout, database schema, API contract, and backend phases are in `docs/`.
