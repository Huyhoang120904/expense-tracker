export type TransactionType = "expense" | "income" | "transfer" | "refund";

export type TransactionSource = "agent" | "telegram" | "dashboard";

export type ApiClientKind = "agent" | "telegram" | "local_viewer";

export type ApiScope =
  | "transactions:read"
  | "transactions:create"
  | "transactions:parse";

export interface Settings {
  id: number;
  currency_code: string;
  timezone: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  archived_at: string | null;
}

export interface Category {
  id: string;
  name: string;
  archived: boolean;
}

export interface TransactionRecord {
  id: string;
  transaction_date: string;
  type: TransactionType;
  amount_minor: number;
  currency_code: string;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  source: TransactionSource;
  created_by_client_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Transaction {
  id: string;
  transaction_date: string;
  type: TransactionType;
  amount_minor: number;
  currency_code: string;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  source: TransactionSource;
  created_at: string;
  updated_at: string;
}

export interface CreateTransactionInput {
  transaction_date: string;
  type: TransactionType;
  amount_minor: number;
  currency_code: string;
  category_id?: string | null;
  merchant?: string | null;
  note?: string | null;
}

export interface NormalizedCreateTransaction {
  transaction_date: string;
  type: TransactionType;
  amount_minor: number;
  currency_code: string;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
}

export interface UpdateTransactionInput {
  transaction_date?: string;
  type?: TransactionType;
  amount_minor?: number;
  category_id?: string | null;
  merchant?: string | null;
  note?: string | null;
}

export interface BatchUpdateTransactionPatch {
  category_id?: string | null;
  type?: TransactionType;
  transaction_date?: string;
}

export type BatchTransactionsInput =
  | {
      action: "delete";
      ids: string[];
    }
  | {
      action: "update";
      ids: string[];
      patch: BatchUpdateTransactionPatch;
    };

export interface BatchTransactionsResult {
  action: "delete" | "update";
  requested: number;
  affected: number;
}

export interface TransactionFilterSet {
  month: string | null;
  category_id: string | null;
  type: TransactionType | null;
}

export interface ListTransactionsQuery {
  month?: string;
  category_id?: string;
  type?: TransactionType;
  limit: number;
  cursor?: string;
}

export interface CursorPayload {
  v: 1;
  d: string;
  id: string;
  f: TransactionFilterSet;
}

export interface TransactionPage {
  items: Transaction[];
  next_cursor: string | null;
}

export interface CategorySpending {
  category_id: string | null;
  gross_expenses_minor: number;
  refunds_minor: number;
  net_spending_minor: number;
}

export interface MonthlySummary {
  month: string;
  currency_code: string;
  income_minor: number;
  gross_expenses_minor: number;
  refunds_minor: number;
  net_spending_minor: number;
  remaining_minor: number;
  by_category: CategorySpending[];
}

export interface ApiKeyWithClientRecord {
  id: string;
  client_id: string;
  secret_hash: string;
  scopes_json: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  client_name: string;
  client_kind: ApiClientKind;
}

export interface AuthenticatedClient {
  keyId: string;
  clientId: string;
  clientName: string;
  clientKind: ApiClientKind;
  scopes: ApiScope[];
}

export interface AuthenticatedOwner {
  email: string;
}

export interface IdempotencyRecord {
  client_id: string;
  idempotency_key: string;
  request_hash: string;
  transaction_id: string;
  created_at: string;
}
