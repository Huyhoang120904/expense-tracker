# Expense tracker

The source is split into two apps: a Cloudflare Worker backend in `backend/` and a local React + Vite dashboard in `dashboard/`.

## Start locally

Install the workspace dependencies once:

```sh
npm install
```

Run each app in a separate terminal:

```sh
npm run dev:api
npm run dev:dashboard
```

The dashboard opens at [http://127.0.0.1:5173](http://127.0.0.1:5173). Its `/api` requests proxy to the local Integration Worker on port 8787. The starter dashboard checks the Worker health route; transaction and summary views can be connected as those API routes are implemented.

## Verify

```sh
npm run check
npm run build
```

The product plan, source layout, database schema, API contract, and backend phases are in `docs/`.
