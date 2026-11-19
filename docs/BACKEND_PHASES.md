# Backend implementation phases

Use [the OpenAPI contract](openapi.json) for request and response shapes and [the D1 schema](DB_SCHEMA.md) for storage. Each phase ends with a small set of checks before the next phase starts.

## Source code layers

| Layer | Responsibility |
|---|---|
| **Router** | Hono routes, request authentication and scope checks, Zod request validation, and HTTP responses. Pass the authenticated caller and validated input to the service. |
| **Service** | Apply ledger rules, including currency and category validation, idempotency, soft deletion, and monthly totals. Use plain TypeScript types and call repositories for storage. The Telegram handler calls the same service after authenticating the caller. |
| **Repository** | Run prepared D1 queries and map database rows to TypeScript values. Expose an atomic create operation that writes a transaction and its idempotency record together. |

The Worker entry point wires the dependencies. The router calls the service, the service calls the repository, and the repository accesses D1. Keep Hono request objects in the router and D1 bindings in the repository. The Integration Worker and Dashboard Worker share the ledger service and repository, with their own routes and authentication.

See the [source initialization plan](SOURCE_INIT.md) for the project layout and scaffold order.

Start with two D1 repositories. The ledger repository owns transactions, category and settings queries, and the atomic write for a transaction and its idempotency record. The API key repository owns API clients and key metadata. Add a Telegram repository when webhook deduplication is implemented.

## Implementation phases

| Phase | Deliverable | Done when |
|---|---|---|
| **1. Ledger and credentials** | Create the local D1 migration for settings, categories, transactions, API clients, API keys, and idempotency records. Seed categories and provision scoped development keys through a local setup command. | The migration runs against an empty database. Missing, invalid, expired, and revoked keys fail authentication. An active key with the wrong scope receives `403`. |
| **2. Create and retrieve** | Implement `POST /v1/transactions` and `GET /v1/transactions/{id}` on the Integration Worker. | A client can create and fetch an expense or income row. Concurrent requests with the same key and payload create one row. A retry returns the existing ID, and a different payload with the same key returns `409`. |
| **3. Browse the ledger** | Add `GET /v1/transactions` and `GET /v1/categories`. Filter transactions by month, category, or type and paginate using a cursor. | A read-only client can load the ledger and category labels. A fixed dataset with many rows on one date paginates without skips or duplicates. Invalid filters and mismatched cursors return `400`. |
| **4. Owner edits and deletes** | Add `PATCH` and `DELETE /v1/transactions/{id}` on the Dashboard Worker behind Cloudflare Access. Reuse the ledger service from phases 2 and 3. | The owner can change an amount or clear a note. A deleted row disappears from normal reads. Repeated deletion returns `204`. Integration keys cannot edit or delete. |
| **5. Monthly totals** | Add `GET /v1/summary?month=YYYY-MM` and use it as the reporting contract for the local viewer and agent. | A month with ₫15,000,000 income, ₫45,000 in expenses, a ₫5,000 refund, and a ₫1,000,000 transfer returns ₫40,000 net spending and ₫14,960,000 remaining. Empty months return zero totals and an empty category breakdown. |

## CRUD rules

- **Create** requires a valid calendar date, type, amount in minor units, and the configured currency. Optional values can be omitted or sent as `null`. The server sets the ID, source, and timestamps. Requests use `Idempotency-Key` per client. Normalize validated payloads before hashing and commit the row and idempotency record atomically. Keep a replay valid after key rotation or soft deletion.
- **Read** returns active rows ordered by local transaction date and then ID, both descending. The cursor encodes the last row's ordering values and the filter set. An unknown or deleted ID returns `404` on a single-row read.
- **Update** accepts a nonempty partial JSON object. Omitted fields retain their values. `category_id`, `merchant`, and `note` can be cleared with `null`. Validate the resulting row, keep its original currency and source, and update its modification timestamp.
- **Delete** sets `deleted_at` and keeps the row ID available for idempotency records. Unknown IDs return `404`. Dashboard writes require the authorized owner session and a same-origin request.

## After the base API

Build the localhost viewer against the read endpoints. Add the hosted dashboard's owner workflows and key-management UI, including creating, rotating, and revoking integration keys. Then extend the contract with the AI parse endpoint and connect Telegram's review-and-save flow. Those integrations can ship independently once the base API is exercised locally.
