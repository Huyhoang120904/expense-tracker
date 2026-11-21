import type {
  CategoryRecord,
  IdempotencyRecord,
  Settings,
  Transaction,
  TransactionRecord,
  TransactionSource,
  TransactionType,
} from "../domain/types";

export class IdempotencyKeyRaceError extends Error {
  constructor() {
    super("Concurrent idempotency key conflict");
    this.name = "IdempotencyKeyRaceError";
  }
}

export interface NewTransactionRow {
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
}

export interface ListTransactionsCriteria {
  monthRange?: { start: string; endExclusive: string };
  categoryId?: string;
  type?: TransactionType;
  cursor?: { d: string; id: string };
  limit: number;
}

export interface UpdateTransactionValues {
  transaction_date: string;
  type: TransactionType;
  amount_minor: number;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  updated_at: string;
}

export interface BatchUpdateTransactionValues {
  category_id?: string | null;
  type?: TransactionType;
  transaction_date?: string;
  updated_at: string;
}

export interface MonthlySummaryTotalsRow {
  income_minor: number;
  gross_expenses_minor: number;
  refunds_minor: number;
}

export interface MonthlyCategoryAggregateRow {
  category_id: string | null;
  gross_expenses_minor: number;
  refunds_minor: number;
}

export interface LedgerRepository {
  getSettings(): Promise<Settings>;
  listCategories(): Promise<CategoryRecord[]>;
  getCategoryById(id: string): Promise<CategoryRecord | null>;
  getIdempotencyRecord(
    clientId: string,
    key: string,
  ): Promise<IdempotencyRecord | null>;
  createTransactionWithIdempotency(
    txRow: NewTransactionRow,
    idempotencyRow: IdempotencyRecord,
  ): Promise<void>;
  createTransactionDirect(txRow: NewTransactionRow): Promise<void>;
  getActiveTransactionById(id: string): Promise<Transaction | null>;
  getTransactionMetaById(
    id: string,
  ): Promise<{ id: string; deleted_at: string | null } | null>;
  listTransactions(criteria: ListTransactionsCriteria): Promise<Transaction[]>;
  updateTransaction(
    id: string,
    nextValues: UpdateTransactionValues,
  ): Promise<Transaction | null>;
  softDeleteTransaction(id: string, timestamp: string): Promise<void>;
  batchSoftDeleteTransactions(ids: string[], timestamp: string): Promise<number>;
  batchUpdateTransactions(
    ids: string[],
    values: BatchUpdateTransactionValues,
  ): Promise<number>;
  getMonthlySummaryAggregates(monthRange: {
    start: string;
    endExclusive: string;
  }): Promise<{
    totals: MonthlySummaryTotalsRow;
    byCategory: MonthlyCategoryAggregateRow[];
  }>;
}

function mapTransactionRow(row: TransactionRecord): Transaction {
  return {
    id: row.id,
    transaction_date: row.transaction_date,
    type: row.type,
    amount_minor: Number(row.amount_minor),
    currency_code: row.currency_code,
    category_id: row.category_id,
    merchant: row.merchant,
    note: row.note,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  return (
    msg.includes("unique constraint failed") ||
    msg.includes("sqlite_constraint_primarykey") ||
    msg.includes("sqlite_constraint_unique")
  );
}

export class D1LedgerRepository implements LedgerRepository {
  constructor(private readonly db: D1Database) {}

  async getSettings(): Promise<Settings> {
    const row = await this.db
      .prepare("SELECT id, currency_code, timezone FROM settings WHERE id = 1")
      .first<Settings>();

    if (!row) {
      throw new Error("Ledger settings row (id=1) is missing.");
    }
    return {
      id: Number(row.id),
      currency_code: row.currency_code,
      timezone: row.timezone,
    };
  }

  async listCategories(): Promise<CategoryRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT id, name, archived_at
         FROM categories
         ORDER BY CASE WHEN archived_at IS NULL THEN 0 ELSE 1 END, name ASC, id ASC`,
      )
      .all<CategoryRecord>();

    return result.results.map((row) => ({
      id: row.id,
      name: row.name,
      archived_at: row.archived_at ?? null,
    }));
  }

  async getCategoryById(id: string): Promise<CategoryRecord | null> {
    const row = await this.db
      .prepare("SELECT id, name, archived_at FROM categories WHERE id = ?")
      .bind(id)
      .first<CategoryRecord>();

    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      archived_at: row.archived_at ?? null,
    };
  }

  async getIdempotencyRecord(
    clientId: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT client_id, idempotency_key, request_hash, transaction_id, created_at
         FROM api_idempotency
         WHERE client_id = ? AND idempotency_key = ?`,
      )
      .bind(clientId, key)
      .first<IdempotencyRecord>();

    return row ?? null;
  }

  async createTransactionWithIdempotency(
    txRow: NewTransactionRow,
    idempotencyRow: IdempotencyRecord,
  ): Promise<void> {
    const insertTransaction = this.db
      .prepare(
        `INSERT INTO transactions (
           id, transaction_date, type, amount_minor, currency_code,
           category_id, merchant, note, source, created_by_client_id,
           created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        txRow.id,
        txRow.transaction_date,
        txRow.type,
        txRow.amount_minor,
        txRow.currency_code,
        txRow.category_id,
        txRow.merchant,
        txRow.note,
        txRow.source,
        txRow.created_by_client_id,
        txRow.created_at,
        txRow.updated_at,
      );

    const insertIdempotency = this.db
      .prepare(
        `INSERT INTO api_idempotency (
           client_id, idempotency_key, request_hash, transaction_id, created_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        idempotencyRow.client_id,
        idempotencyRow.idempotency_key,
        idempotencyRow.request_hash,
        idempotencyRow.transaction_id,
        idempotencyRow.created_at,
      );

    try {
      await this.db.batch([insertTransaction, insertIdempotency]);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new IdempotencyKeyRaceError();
      }
      throw err;
    }
  }

  async createTransactionDirect(txRow: NewTransactionRow): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO transactions (
           id, transaction_date, type, amount_minor, currency_code,
           category_id, merchant, note, source, created_by_client_id,
           created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        txRow.id,
        txRow.transaction_date,
        txRow.type,
        txRow.amount_minor,
        txRow.currency_code,
        txRow.category_id,
        txRow.merchant,
        txRow.note,
        txRow.source,
        txRow.created_by_client_id,
        txRow.created_at,
        txRow.updated_at,
      )
      .run();
  }

  async getActiveTransactionById(id: string): Promise<Transaction | null> {
    const row = await this.db
      .prepare(
        `SELECT
           id, transaction_date, type, amount_minor, currency_code,
           category_id, merchant, note, source, created_by_client_id,
           created_at, updated_at, deleted_at
         FROM transactions
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(id)
      .first<TransactionRecord>();

    return row ? mapTransactionRow(row) : null;
  }

  async getTransactionMetaById(
    id: string,
  ): Promise<{ id: string; deleted_at: string | null } | null> {
    const row = await this.db
      .prepare("SELECT id, deleted_at FROM transactions WHERE id = ?")
      .bind(id)
      .first<{ id: string; deleted_at: string | null }>();

    if (!row) {
      return null;
    }
    return {
      id: row.id,
      deleted_at: row.deleted_at ?? null,
    };
  }

  async listTransactions(
    criteria: ListTransactionsCriteria,
  ): Promise<Transaction[]> {
    const conditions: string[] = ["deleted_at IS NULL"];
    const params: unknown[] = [];

    if (criteria.monthRange) {
      conditions.push("transaction_date >= ? AND transaction_date < ?");
      params.push(criteria.monthRange.start, criteria.monthRange.endExclusive);
    }

    if (criteria.categoryId !== undefined) {
      conditions.push("category_id = ?");
      params.push(criteria.categoryId);
    }

    if (criteria.type !== undefined) {
      conditions.push("type = ?");
      params.push(criteria.type);
    }

    if (criteria.cursor) {
      conditions.push(
        "(transaction_date < ? OR (transaction_date = ? AND id < ?))",
      );
      params.push(criteria.cursor.d, criteria.cursor.d, criteria.cursor.id);
    }

    params.push(criteria.limit + 1);

    const sql = `
      SELECT
        id, transaction_date, type, amount_minor, currency_code,
        category_id, merchant, note, source, created_by_client_id,
        created_at, updated_at, deleted_at
      FROM transactions
      WHERE ${conditions.join(" AND ")}
      ORDER BY transaction_date DESC, id DESC
      LIMIT ?
    `;

    const result = await this.db
      .prepare(sql)
      .bind(...params)
      .all<TransactionRecord>();

    return result.results.map(mapTransactionRow);
  }

  async updateTransaction(
    id: string,
    nextValues: UpdateTransactionValues,
  ): Promise<Transaction | null> {
    const updateResult = await this.db
      .prepare(
        `UPDATE transactions
         SET transaction_date = ?,
             type = ?,
             amount_minor = ?,
             category_id = ?,
             merchant = ?,
             note = ?,
             updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(
        nextValues.transaction_date,
        nextValues.type,
        nextValues.amount_minor,
        nextValues.category_id,
        nextValues.merchant,
        nextValues.note,
        nextValues.updated_at,
        id,
      )
      .run();

    if ((updateResult.meta?.changes ?? 0) === 0) {
      return null;
    }

    return this.getActiveTransactionById(id);
  }

  async softDeleteTransaction(id: string, timestamp: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE transactions
         SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(timestamp, timestamp, id)
      .run();
  }

  private chunkIds(ids: string[], chunkSize = 50): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      chunks.push(ids.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async batchSoftDeleteTransactions(
    ids: string[],
    timestamp: string,
  ): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const statements = this.chunkIds(ids).map((chunk) => {
      const placeholders = chunk.map(() => "?").join(", ");
      return this.db
        .prepare(
          `UPDATE transactions
           SET deleted_at = ?, updated_at = ?
           WHERE deleted_at IS NULL AND id IN (${placeholders})`,
        )
        .bind(timestamp, timestamp, ...chunk);
    });

    const results = await this.db.batch(statements);
    return results.reduce(
      (sum, result) => sum + Number(result.meta?.changes ?? 0),
      0,
    );
  }

  async batchUpdateTransactions(
    ids: string[],
    values: BatchUpdateTransactionValues,
  ): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const setClauses: string[] = [];
    const baseParams: unknown[] = [];

    if (values.category_id !== undefined) {
      setClauses.push("category_id = ?");
      baseParams.push(values.category_id);
    }
    if (values.type !== undefined) {
      setClauses.push("type = ?");
      baseParams.push(values.type);
    }
    if (values.transaction_date !== undefined) {
      setClauses.push("transaction_date = ?");
      baseParams.push(values.transaction_date);
    }
    setClauses.push("updated_at = ?");
    baseParams.push(values.updated_at);

    const setSql = setClauses.join(", ");
    const statements = this.chunkIds(ids).map((chunk) => {
      const placeholders = chunk.map(() => "?").join(", ");
      return this.db
        .prepare(
          `UPDATE transactions
           SET ${setSql}
           WHERE deleted_at IS NULL AND id IN (${placeholders})`,
        )
        .bind(...baseParams, ...chunk);
    });

    const results = await this.db.batch(statements);
    return results.reduce(
      (sum, result) => sum + Number(result.meta?.changes ?? 0),
      0,
    );
  }

  async getMonthlySummaryAggregates(monthRange: {
    start: string;
    endExclusive: string;
  }): Promise<{
    totals: MonthlySummaryTotalsRow;
    byCategory: MonthlyCategoryAggregateRow[];
  }> {
    const totalsRow = await this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount_minor ELSE 0 END), 0) AS income_minor,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_minor ELSE 0 END), 0) AS gross_expenses_minor,
           COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_minor ELSE 0 END), 0) AS refunds_minor
         FROM transactions
         WHERE deleted_at IS NULL
           AND transaction_date >= ?
           AND transaction_date < ?`,
      )
      .bind(monthRange.start, monthRange.endExclusive)
      .first<MonthlySummaryTotalsRow>();

    const byCategoryResult = await this.db
      .prepare(
        `SELECT
           category_id,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_minor ELSE 0 END), 0) AS gross_expenses_minor,
           COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_minor ELSE 0 END), 0) AS refunds_minor
         FROM transactions
         WHERE deleted_at IS NULL
           AND transaction_date >= ?
           AND transaction_date < ?
           AND type IN ('expense', 'refund')
         GROUP BY category_id`,
      )
      .bind(monthRange.start, monthRange.endExclusive)
      .all<MonthlyCategoryAggregateRow>();

    return {
      totals: {
        income_minor: Number(totalsRow?.income_minor ?? 0),
        gross_expenses_minor: Number(totalsRow?.gross_expenses_minor ?? 0),
        refunds_minor: Number(totalsRow?.refunds_minor ?? 0),
      },
      byCategory: byCategoryResult.results.map((row) => ({
        category_id: row.category_id ?? null,
        gross_expenses_minor: Number(row.gross_expenses_minor),
        refunds_minor: Number(row.refunds_minor),
      })),
    };
  }
}
