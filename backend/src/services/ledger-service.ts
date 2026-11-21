import { generateTransactionId, nowUtcIso } from "../domain/crypto";
import {
  badRequest,
  forbidden,
  idempotencyConflict,
  notFound,
  validationError,
} from "../domain/errors";
import type {
  AuthenticatedClient,
  BatchTransactionsInput,
  BatchTransactionsResult,
  Category,
  CategorySpending,
  CreateTransactionInput,
  ListTransactionsQuery,
  MonthlySummary,
  Transaction,
  TransactionPage,
  TransactionSource,
  UpdateTransactionInput,
} from "../domain/types";
import {
  buildFilterSet,
  decodeCursor,
  encodeCursor,
  filterSetsEqual,
  hashNormalizedCreatePayload,
  monthToDateRange,
  normalizeCreateTransaction,
} from "../domain/validation";
import {
  IdempotencyKeyRaceError,
  type LedgerRepository,
} from "../repositories/ledger-repository";

function clientKindToSource(kind: AuthenticatedClient["clientKind"]): TransactionSource {
  if (kind === "agent") {
    return "agent";
  }
  if (kind === "telegram") {
    return "telegram";
  }
  throw forbidden();
}

function compareCategorySpending(
  a: CategorySpending,
  b: CategorySpending,
): number {
  if (b.net_spending_minor !== a.net_spending_minor) {
    return b.net_spending_minor - a.net_spending_minor;
  }
  if (b.gross_expenses_minor !== a.gross_expenses_minor) {
    return b.gross_expenses_minor - a.gross_expenses_minor;
  }
  if (a.category_id === b.category_id) {
    return 0;
  }
  if (a.category_id === null) {
    return 1;
  }
  if (b.category_id === null) {
    return -1;
  }
  return a.category_id.localeCompare(b.category_id);
}

export class LedgerService {
  constructor(private readonly ledger: LedgerRepository) {}

  async listCategories(): Promise<Category[]> {
    const records = await this.ledger.listCategories();
    return records.map((row) => ({
      id: row.id,
      name: row.name,
      archived: row.archived_at !== null,
    }));
  }

  async createTransactionForClient(
    client: AuthenticatedClient,
    idempotencyKey: string,
    input: CreateTransactionInput,
  ): Promise<{ id: string; replayed: boolean }> {
    const source = clientKindToSource(client.clientKind);
    const normalized = normalizeCreateTransaction(input);
    const requestHash = await hashNormalizedCreatePayload(normalized);

    const existing = await this.ledger.getIdempotencyRecord(
      client.clientId,
      idempotencyKey,
    );
    if (existing) {
      if (existing.request_hash === requestHash) {
        return { id: existing.transaction_id, replayed: true };
      }
      throw idempotencyConflict();
    }

    await this.assertValidCurrencyAndActiveCategory(
      normalized.currency_code,
      normalized.category_id,
    );

    const id = generateTransactionId();
    const now = nowUtcIso();

    try {
      await this.ledger.createTransactionWithIdempotency(
        {
          id,
          transaction_date: normalized.transaction_date,
          type: normalized.type,
          amount_minor: normalized.amount_minor,
          currency_code: normalized.currency_code,
          category_id: normalized.category_id,
          merchant: normalized.merchant,
          note: normalized.note,
          source,
          created_by_client_id: client.clientId,
          created_at: now,
          updated_at: now,
        },
        {
          client_id: client.clientId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          transaction_id: id,
          created_at: now,
        },
      );
      return { id, replayed: false };
    } catch (err) {
      if (err instanceof IdempotencyKeyRaceError) {
        const raced = await this.ledger.getIdempotencyRecord(
          client.clientId,
          idempotencyKey,
        );
        if (raced && raced.request_hash === requestHash) {
          return { id: raced.transaction_id, replayed: true };
        }
        throw idempotencyConflict();
      }
      throw err;
    }
  }

  async createTransactionForOwner(
    input: CreateTransactionInput,
  ): Promise<{ id: string }> {
    const normalized = normalizeCreateTransaction(input);
    await this.assertValidCurrencyAndActiveCategory(
      normalized.currency_code,
      normalized.category_id,
    );

    const id = generateTransactionId();
    const now = nowUtcIso();

    await this.ledger.createTransactionDirect({
      id,
      transaction_date: normalized.transaction_date,
      type: normalized.type,
      amount_minor: normalized.amount_minor,
      currency_code: normalized.currency_code,
      category_id: normalized.category_id,
      merchant: normalized.merchant,
      note: normalized.note,
      source: "dashboard",
      created_by_client_id: null,
      created_at: now,
      updated_at: now,
    });

    return { id };
  }

  async getTransaction(id: string): Promise<Transaction> {
    const row = await this.ledger.getActiveTransactionById(id);
    if (!row) {
      throw notFound();
    }
    return row;
  }

  async listTransactions(
    query: ListTransactionsQuery,
  ): Promise<TransactionPage> {
    const filterSet = buildFilterSet(query);
    let cursorValues: { d: string; id: string } | undefined;

    if (query.cursor !== undefined) {
      const decoded = decodeCursor(query.cursor);
      if (!filterSetsEqual(decoded.f, filterSet)) {
        throw badRequest("The cursor does not match the active filters.", {
          cursor: "Cursor does not match current filters.",
        });
      }
      cursorValues = { d: decoded.d, id: decoded.id };
    }

    const monthRange = query.month ? monthToDateRange(query.month) : undefined;
    const rows = await this.ledger.listTransactions({
      monthRange,
      categoryId: query.category_id,
      type: query.type,
      cursor: cursorValues,
      limit: query.limit,
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const lastItem = items[items.length - 1];
    const next_cursor =
      hasMore && lastItem
        ? encodeCursor({
            v: 1,
            d: lastItem.transaction_date,
            id: lastItem.id,
            f: filterSet,
          })
        : null;

    return { items, next_cursor };
  }

  async updateTransaction(
    id: string,
    patch: UpdateTransactionInput,
  ): Promise<Transaction> {
    const existing = await this.ledger.getActiveTransactionById(id);
    if (!existing) {
      throw notFound();
    }

    if (
      patch.category_id !== undefined &&
      patch.category_id !== null &&
      patch.category_id !== existing.category_id
    ) {
      await this.assertActiveCategory(patch.category_id);
    }

    const updated = await this.ledger.updateTransaction(id, {
      transaction_date: patch.transaction_date ?? existing.transaction_date,
      type: patch.type ?? existing.type,
      amount_minor: patch.amount_minor ?? existing.amount_minor,
      category_id:
        patch.category_id !== undefined
          ? patch.category_id
          : existing.category_id,
      merchant:
        patch.merchant !== undefined ? patch.merchant : existing.merchant,
      note: patch.note !== undefined ? patch.note : existing.note,
      updated_at: nowUtcIso(),
    });

    if (!updated) {
      throw notFound();
    }
    return updated;
  }

  async deleteTransaction(id: string): Promise<void> {
    const meta = await this.ledger.getTransactionMetaById(id);
    if (!meta) {
      throw notFound();
    }
    if (meta.deleted_at !== null) {
      return;
    }
    await this.ledger.softDeleteTransaction(id, nowUtcIso());
  }

  async batchTransactions(
    input: BatchTransactionsInput,
  ): Promise<BatchTransactionsResult> {
    const uniqueIds = Array.from(new Set(input.ids));
    const now = nowUtcIso();

    if (input.action === "delete") {
      const affected = await this.ledger.batchSoftDeleteTransactions(
        uniqueIds,
        now,
      );
      return {
        action: "delete",
        requested: uniqueIds.length,
        affected,
      };
    }

    if (
      input.patch.category_id !== undefined &&
      input.patch.category_id !== null
    ) {
      await this.assertActiveCategory(input.patch.category_id);
    }

    const affected = await this.ledger.batchUpdateTransactions(uniqueIds, {
      ...input.patch,
      updated_at: now,
    });
    return {
      action: "update",
      requested: uniqueIds.length,
      affected,
    };
  }

  async getMonthlySummary(month: string): Promise<MonthlySummary> {
    const settings = await this.ledger.getSettings();
    const monthRange = monthToDateRange(month);
    const { totals, byCategory } =
      await this.ledger.getMonthlySummaryAggregates(monthRange);

    const net_spending_minor =
      totals.gross_expenses_minor - totals.refunds_minor;
    const remaining_minor = totals.income_minor - net_spending_minor;

    const by_category: CategorySpending[] = byCategory
      .map((row) => ({
        category_id: row.category_id,
        gross_expenses_minor: row.gross_expenses_minor,
        refunds_minor: row.refunds_minor,
        net_spending_minor: row.gross_expenses_minor - row.refunds_minor,
      }))
      .sort(compareCategorySpending);

    return {
      month,
      currency_code: settings.currency_code,
      income_minor: totals.income_minor,
      gross_expenses_minor: totals.gross_expenses_minor,
      refunds_minor: totals.refunds_minor,
      net_spending_minor,
      remaining_minor,
      by_category,
    };
  }

  private async assertValidCurrencyAndActiveCategory(
    currencyCode: string,
    categoryId: string | null,
  ): Promise<void> {
    const settings = await this.ledger.getSettings();
    if (currencyCode !== settings.currency_code) {
      throw validationError("One or more transaction fields are invalid.", {
        currency_code: `Currency must match configured currency (${settings.currency_code}).`,
      });
    }

    if (categoryId !== null) {
      await this.assertActiveCategory(categoryId);
    }
  }

  private async assertActiveCategory(categoryId: string): Promise<void> {
    const category = await this.ledger.getCategoryById(categoryId);
    if (!category || category.archived_at !== null) {
      throw validationError("One or more transaction fields are invalid.", {
        category_id: "Category must reference an active category.",
      });
    }
  }
}
