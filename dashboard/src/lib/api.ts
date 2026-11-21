export type TransactionType = "expense" | "income" | "transfer" | "refund";
export type TransactionSource = "agent" | "telegram" | "dashboard";

export interface Category {
  id: string;
  name: string;
  archived: boolean;
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

export interface Capabilities {
  mode: "owner" | "readonly";
  can_write: boolean;
}

export interface CreateTransactionPayload {
  transaction_date: string;
  type: TransactionType;
  amount_minor: number;
  currency_code: string;
  category_id?: string | null;
  merchant?: string | null;
  note?: string | null;
}

export interface UpdateTransactionPayload {
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

export type BatchTransactionsPayload =
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

export interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function requestApi<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = (payload as ApiErrorEnvelope | null)?.error;
    throw new ApiClientError(
      response.status,
      err?.code ?? "internal_error",
      err?.message ?? `Yêu cầu thất bại (${response.status})`,
      err?.fields,
    );
  }

  return payload as T;
}

export async function fetchHealth(): Promise<{ status: string }> {
  return requestApi<{ status: string }>("/api/health");
}

export async function fetchCapabilities(): Promise<Capabilities> {
  return requestApi<Capabilities>("/api/capabilities");
}

export async function fetchCategories(): Promise<Category[]> {
  const data = await requestApi<{ items: Category[] }>("/api/v1/categories");
  return data.items;
}

export async function fetchSummary(month: string): Promise<MonthlySummary> {
  const params = new URLSearchParams({ month });
  return requestApi<MonthlySummary>(`/api/v1/summary?${params.toString()}`);
}

export interface ListTransactionsParams {
  month?: string;
  category_id?: string;
  type?: TransactionType;
  limit?: number;
  cursor?: string;
}

export async function fetchTransactions(
  params: ListTransactionsParams,
): Promise<TransactionPage> {
  const search = new URLSearchParams();
  if (params.month) {
    search.set("month", params.month);
  }
  if (params.category_id) {
    search.set("category_id", params.category_id);
  }
  if (params.type) {
    search.set("type", params.type);
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params.cursor) {
    search.set("cursor", params.cursor);
  }
  const qs = search.toString();
  return requestApi<TransactionPage>(
    qs ? `/api/v1/transactions?${qs}` : "/api/v1/transactions",
  );
}

export async function fetchTransactionById(id: string): Promise<Transaction> {
  return requestApi<Transaction>(
    `/api/v1/transactions/${encodeURIComponent(id)}`,
  );
}

export async function createTransaction(
  payload: CreateTransactionPayload,
): Promise<{ id: string }> {
  return requestApi<{ id: string }>("/api/v1/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateTransaction(
  id: string,
  payload: UpdateTransactionPayload,
): Promise<Transaction> {
  return requestApi<Transaction>(
    `/api/v1/transactions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteTransaction(id: string): Promise<void> {
  return requestApi<void>(`/api/v1/transactions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function batchTransactions(
  payload: BatchTransactionsPayload,
): Promise<BatchTransactionsResult> {
  return requestApi<BatchTransactionsResult>("/api/v1/transactions/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
