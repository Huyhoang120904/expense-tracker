# Cloudflare D1 database schema

```mermaid
erDiagram
    categories |o..o{ transactions : classifies
    transactions |o..o| transaction_drafts : records
    transactions ||..o{ api_idempotency : resolves
    api_clients ||..o{ api_keys : owns
    api_clients ||..o{ api_idempotency : namespaces
    api_clients |o..o{ transactions : creates

    settings {
        INTEGER id PK "Singleton row with ID 1"
        TEXT currency_code
        TEXT timezone
    }

    categories {
        TEXT id PK
        TEXT name
        TEXT archived_at "Nullable"
    }

    transactions {
        TEXT id PK
        TEXT transaction_date "Local YYYY-MM-DD"
        TEXT type "Expense, income, transfer, or refund"
        INTEGER amount_minor "Positive integer"
        TEXT currency_code
        TEXT category_id FK "Nullable"
        TEXT merchant "Nullable"
        TEXT note "Nullable"
        TEXT source "Dashboard, Telegram, or agent"
        TEXT created_by_client_id FK "Nullable for dashboard writes"
        TEXT created_at
        TEXT updated_at
        TEXT deleted_at "Nullable"
    }

    transaction_drafts {
        TEXT id PK
        TEXT source
        TEXT fields_json "Allows incomplete fields"
        TEXT issues_json
        TEXT created_at
        TEXT expires_at
        TEXT saved_transaction_id FK, UK "Nullable until confirmed"
    }

    api_clients {
        TEXT id PK
        TEXT name
        TEXT kind "Agent, Telegram, or local viewer"
    }

    api_keys {
        TEXT id PK "Public lookup ID"
        TEXT client_id FK
        TEXT secret_hash
        TEXT scopes_json
        TEXT created_at
        TEXT expires_at "Nullable"
        TEXT revoked_at "Nullable"
    }

    api_idempotency {
        TEXT client_id PK, FK
        TEXT idempotency_key PK
        TEXT request_hash
        TEXT transaction_id FK
        TEXT created_at
    }

    telegram_updates {
        INTEGER update_id PK
        TEXT processed_at
    }
```

- Store lifecycle timestamps in UTC. Group reports by the transaction's local date. New entries use the configured currency.
- Store salary and other received payments as `transactions` rows with `type = 'income'`. Compute monthly income from active income rows by received date.
- Index `transactions(transaction_date, id)` and `transactions(category_id, transaction_date, id)`. Omit soft-deleted entries from ledger views and totals. Archive categories to keep historical rows readable.
- Confirm each draft with an atomic write that checks the draft is unsaved and unexpired, creates its ledger row, and links the two. Keep receipt images and raw credentials outside D1.
- Keep client identity stable across key rotations. Store only the hash of each random API key secret and enforce that key's scopes on every call.
- Use `(client_id, idempotency_key)` as a composite primary key. Write the idempotency record and transaction together. A matching retry returns the existing transaction ID, and a different request with the same key returns a conflict.
- Deduplicate Telegram deliveries by `update_id`. Record the processed update together with any database changes it produces.
