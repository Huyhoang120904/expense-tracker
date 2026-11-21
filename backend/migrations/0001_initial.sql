PRAGMA foreign_keys = ON;

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  timezone TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE api_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('agent', 'telegram', 'local_viewer'))
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES api_clients(id),
  secret_hash TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT
);

CREATE INDEX idx_api_keys_client_id ON api_keys(client_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  transaction_date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'refund')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
  category_id TEXT REFERENCES categories(id),
  merchant TEXT,
  note TEXT,
  source TEXT NOT NULL CHECK (source IN ('dashboard', 'telegram', 'agent')),
  created_by_client_id TEXT REFERENCES api_clients(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_transactions_date_id ON transactions(transaction_date DESC, id DESC);
CREATE INDEX idx_transactions_category_date_id ON transactions(category_id, transaction_date DESC, id DESC);

CREATE TABLE api_idempotency (
  client_id TEXT NOT NULL REFERENCES api_clients(id),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (client_id, idempotency_key)
);
