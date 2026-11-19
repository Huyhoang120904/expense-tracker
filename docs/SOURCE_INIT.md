# Source initialization plan

Keep one Git repository with two separate npm workspace apps: `backend/` for the Cloudflare Integration Worker and `dashboard/` for the local React + Vite dashboard.

```text
expense-tracker/
  backend/
    migrations/
    src/workers/integration.ts
    package.json
    tsconfig.json
    wrangler.integration.jsonc
  dashboard/
    src/
    index.html
    package.json
    tsconfig.json
    vite.config.ts
  docs/
  package.json
```

Add each app's entry point and npm script in the same step so it can run immediately.

1. **Backend base.** Set up TypeScript, Hono, Zod, and Wrangler. Add an Integration Worker health route and local D1 binding. Verify `npm run check` and `npm run dev:api`, then implement the ledger and credentials phases.
2. **Local dashboard base.** Scaffold the React + Vite app in `dashboard/`. Proxy `/api` requests to the local Worker while developing. Once the ledger list, categories, and summary endpoints are ready, connect them through a localhost server that keeps the read-only key on the server.
3. **Hosted dashboard.** Add a Dashboard Worker and its Wrangler configuration when implementing owner edits. Reuse the dashboard build and wire authenticated owner routes separately.

See the [backend implementation phases](BACKEND_PHASES.md) for the CRUD build order and acceptance checks.
