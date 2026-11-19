# Personal expense tracker

Build a single-user tracker that accepts receipt photos, bank screenshots, and pasted transactions. Telegram is the quick-entry interface, a private web dashboard shows and edits the ledger, and an authenticated API lets an external agent log expenses and answer spending questions. The target is **$0 per month in infrastructure costs at personal-use volumes**.

## First release

- **Telegram** — DM a bot a receipt photo, a bank screenshot, a copied transaction row, or a message like `45k lunch`. The bot shows a draft with **Save** and **Edit** actions.
- **Dashboard** — Add and edit transactions, search and filter the ledger, and view monthly spending by category. Include CSV export and a downloadable JSON backup with a validated restore flow.
- **Monthly income** — Log salary and other payments as income from the dashboard, Telegram, or the agent API. Show total income, net spending, and the amount left after spending for the selected month in both dashboard views.
- **Local web app** — Run the same dashboard UI on `localhost` in read-only mode to browse the live ledger, filter transactions, and view monthly totals. The hosted dashboard handles edits, exports, and key management.
- **Agent API** — Give the agent its own credential so it can parse inputs, create transactions, list transactions, and read totals.
- **Settings** — Choose one currency and a timezone during setup. VND and `Asia/Ho_Chi_Minh` are proposed defaults. Use a small set of editable categories.

## Infrastructure

| Component | Deployment | Role |
|---|---|---|
| Dashboard Worker | Cloudflare Workers Free, on an included `workers.dev` URL | Serve the web app and dashboard API. Protect the entire Worker with Cloudflare Access. Allow only the owner's email and use a one-time email code for sign-in. |
| Integration Worker | Cloudflare Workers Free, on a separate `workers.dev` URL | Receive Telegram webhooks and serve the HTTPS JSON API for the agent and local web app. Authenticate each route using its own credential. |
| Ledger | Cloudflare D1 Free | Store transactions, categories, settings, pending drafts, and API key metadata. Both Workers use the same D1 database and share validation and ledger code in the same repository. |
| Local web app | Loopback-only server on the owner's computer | Serve the dashboard UI and proxy its read requests to the hosted API. Keep the read-only key on the local server. |
| Receipt and text extraction | Cloudflare Workers AI Free | Run `@cf/google/gemma-4-26b-a4b-it` through the Workers AI binding. Use its vision capability to read images and its text capability to extract and classify transactions. |
| Chat | Telegram Bot API | Use one-on-one messages with a bot created through BotFather. The webhook stays reachable while the owner's computer is off. |

Workers Free includes 100,000 requests per day. D1 Free includes 5 million row reads and 100,000 row writes per day, with up to 5 GB of storage across the account. Workers AI has a separate allowance of 10,000 neurons per day. At Gemma 4's published rates, a call with 2,000 billed input tokens and 200 output tokens uses about 24 neurons, or roughly 420 such calls per day. Measure actual usage on sample receipts because image size and output length affect cost. Manual entry and structured API requests work without AI. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

Deployment and integration references for the services above. [Included Worker URLs](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) · [Cloudflare Access pricing](https://www.cloudflare.com/sase/products/access/) · [Email sign-in](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) · [Gemma 4 model](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) · [Telegram Bot API](https://core.telegram.org/bots/api)

## How intake works

1. **Accept a photo or text.** Telegram fetches the attachment through the Bot API. The agent can send a photo upload or a JSON body containing a pasted row or a note. The dashboard keeps a manual entry form.
2. **Extract and classify.** Ask Gemma for one draft per visible transaction, with date, merchant or payee, amount, currency, category, note, and transaction type. For a receipt, extract the amount paid. For a bank screenshot, keep credits and debits distinct and flag when the direction is unclear. Transaction types are `expense`, `income`, `transfer`, and `refund`.
3. **Validate the drafts.** Check types, amount, currency, date, and category against backend rules. Record what came from the input, what was inferred, and which fields need review. Use today's date in the configured timezone and the selected currency as visible defaults for casual input such as `45k lunch`. Flag unclear amounts or directions on receipts and bank rows for correction. Process uploaded images for extraction and discard them afterward.
4. **Review and save.** Show a preview such as **₫45,000 · Highlands Coffee · Food · Expense · 17 Nov**. Telegram saves only when the user confirms. Deduplicate webhook deliveries by Telegram update ID and enforce one ledger entry per confirmed draft ID so repeated taps are safe. The parse API returns drafts, and the agent calls the create endpoint with an idempotency key to save a validated row.

Store amounts as positive integers in the currency's smallest unit and use the transaction type to determine how amounts affect reports. Use the transaction's local date to group rows by month. Sum `income` rows by the date the money was received. Calculate net spending as gross expenses minus refunds posted that month, and the amount left as income minus net spending. Exclude transfers from each total. Save an entry source of `dashboard`, `telegram`, or `agent` so the owner can trace where each row came from.

## D1 schema

See the [database schema and Mermaid ER diagram](DB_SCHEMA.md) for tables, relationships, and constraints.

## Transaction API

The [OpenAPI contract](openapi.json) defines ledger CRUD and monthly reports, with request examples and error responses. The [backend implementation phases](BACKEND_PHASES.md) show the build order and acceptance checks. Add multipart uploads when the AI parse endpoint is implemented.

| Endpoint | Scope | Behavior |
|---|---|---|
| `POST /v1/transactions/parse` | `transactions:parse` | Accept text or a photo and return one or more draft rows and validation issues. Parsing does not create ledger entries. |
| `POST /v1/transactions` | `transactions:create` | Save one validated row and return its ID. Require an `Idempotency-Key` header. A replay returns the original transaction ID, and reuse with different data returns a conflict. |
| `GET /v1/transactions` | `transactions:read` | List transactions with month, category, and type filters and pagination. |
| `GET /v1/transactions/{id}` | `transactions:read` | Fetch one active transaction. |
| `PATCH /v1/transactions/{id}` | Owner session | Edit fields on the Dashboard Worker. |
| `DELETE /v1/transactions/{id}` | Owner session | Soft-delete a transaction on the Dashboard Worker. |
| `GET /v1/summary?month=2026-11` | `transactions:read` | Return income, gross expenses, refunds, net spending, amount left after spending, and spending by category for a month. |
| `GET /v1/categories` | `transactions:read` | Return the valid category IDs and names. |

Add an MCP adapter if the agent requires MCP tools. Editing and deleting transactions use the owner session on the hosted dashboard.

## API keys

| Client | Initial access | Where the key is kept |
|---|---|---|
| External agent | Parse, create, and read transactions | Agent runtime's secrets store |
| Telegram bot | Parse and create transactions | Integration Worker secret |
| Local web app | Read transactions, totals, and categories | Local server environment |

- The owner creates, rotates, and revokes keys from the hosted dashboard. Generate each key with a public lookup ID and a cryptographically random secret. Display the full key once and store only its hash, scopes, and lifecycle metadata in D1. Keep key material out of logs and ledger backups.
- API callers send `Authorization: Bearer <key>` over HTTPS. Resolve the key to its client, verify the secret, revocation and any expiry, then check the required scope. Use the authenticated client to set the transaction source and namespace idempotency keys so rotation preserves retry behavior.
- Telegram requests first pass the webhook secret, private-chat, and owner user ID checks. The webhook handler uses its server-side API key with the same authorization and transaction services as the HTTPS API. Because both handlers run in one Worker, the bot can call those services directly. The Telegram bot token is a separate secret used to call Telegram. [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) · [Telegram webhook authentication](https://core.telegram.org/bots/api#setwebhook)
- On localhost, the browser calls the local server on the same origin. The server binds to loopback, forwards only the supported read routes, and adds the read-only API key server-side. The local view needs an internet connection to fetch the current ledger from Cloudflare.

## Build and verify

1. **Ledger and API** — Follow the [backend implementation phases](BACKEND_PHASES.md) from the D1 migration and scoped keys through CRUD and monthly totals.
2. **Parsing** — Connect Workers AI and expose the parse endpoint. Try clear and blurry receipts, a bank screenshot with several transactions, and pasted text. Check that a receipt with subtotal, tax, and total uses the amount paid. Check that incomplete or ambiguous drafts ask for review and that manual entry still works if AI is unavailable.
3. **Telegram** — Wire the webhook and preview actions. Verify that the owner's DM can save a draft, repeated taps save only once, and a different Telegram account cannot read or enter data.
4. **Dashboard and deployment** — Deploy both Workers on the free plan, configure Access and the production D1 database, and register the Telegram webhook. Verify phone entry, export and restore, and a complete flow in which Telegram saves a transaction, the agent retrieves it, and the owner sees it in both dashboard views. Verify that the local key cannot write and that each revoked key stops working independently.
