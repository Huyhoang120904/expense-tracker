import { useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  batchTransactions,
  createTransaction,
  deleteTransaction,
  fetchCapabilities,
  fetchCategories,
  fetchHealth,
  fetchSummary,
  fetchTransactionById,
  fetchTransactions,
  updateTransaction,
  type BatchTransactionsPayload,
  type CreateTransactionPayload,
  type MonthlySummary,
  type Transaction,
  type TransactionType,
  type UpdateTransactionPayload,
} from "../lib/api";
import { getCurrentMonth, shiftMonth } from "../lib/format";

export interface LedgerFilterInput {
  month?: string;
  category_id?: string;
  type?: TransactionType;
  limit?: number;
}

export interface MonthTransactionsResult {
  items: Transaction[];
  truncated: boolean;
}

export interface MultiMonthSummaryItem {
  month: string;
  summary?: MonthlySummary;
  isLoading: boolean;
}

export interface MultiMonthSummariesResult {
  months: string[];
  items: MultiMonthSummaryItem[];
  isLoading: boolean;
}

export interface SamePeriodComparison {
  currentMinor: number;
  prevMinor: number;
  deltaMinor: number;
  deltaRatio: number | null;
  hasPrevData: boolean;
}

const MONTH_TRANSACTIONS_PAGE_LIMIT = 100;
const MONTH_TRANSACTIONS_MAX_PAGES = 6;
const YYYY_MM_RE = /^\d{4}-\d{2}$/;

export const queryKeys = {
  health: ["health"] as const,
  capabilities: ["capabilities"] as const,
  categories: ["categories"] as const,
  summary: (month: string) => ["summary", month] as const,
  recentTransactions: (month: string) =>
    ["transactions", "recent", month] as const,
  monthlyIncomes: (month: string) =>
    ["transactions", "income", month] as const,
  todayTransactions: (month: string, todayDate: string) =>
    ["transactions", "today", month, todayDate] as const,
  monthTransactions: (month: string) =>
    ["transactions", "month-all", month] as const,
  transactions: (filters: LedgerFilterInput) =>
    [
      "transactions",
      "list",
      {
        month: filters.month ?? null,
        category_id: filters.category_id ?? null,
        type: filters.type ?? null,
        limit: filters.limit ?? 25,
      },
    ] as const,
  transaction: (id: string | null) => ["transactions", "detail", id] as const,
};

async function fetchMonthTransactions(
  month: string,
  signal?: AbortSignal,
): Promise<MonthTransactionsResult> {
  const items: Transaction[] = [];
  let cursor: string | undefined = undefined;
  let truncated = false;

  for (
    let pageIndex = 0;
    pageIndex < MONTH_TRANSACTIONS_MAX_PAGES;
    pageIndex += 1
  ) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const page = await fetchTransactions({
      month,
      limit: MONTH_TRANSACTIONS_PAGE_LIMIT,
      cursor,
    });
    items.push(...page.items);

    if (!page.next_cursor) {
      break;
    }

    if (
      pageIndex === MONTH_TRANSACTIONS_MAX_PAGES - 1 ||
      page.next_cursor === cursor
    ) {
      truncated = true;
      break;
    }

    cursor = page.next_cursor;
  }

  return { items, truncated };
}

function sumPeriodNetSpending(
  txs: Transaction[],
  month: string,
  maxDay: number,
): { netMinor: number; matchingSpendCount: number } {
  if (maxDay <= 0 || !month) {
    return { netMinor: 0, matchingSpendCount: 0 };
  }

  const prefix = `${month}-`;
  let netMinor = 0;
  let matchingSpendCount = 0;

  for (const tx of txs) {
    if (tx.type !== "expense" && tx.type !== "refund") {
      continue;
    }
    if (!tx.transaction_date.startsWith(prefix)) {
      continue;
    }
    const day = Number(tx.transaction_date.slice(8, 10));
    if (!Number.isInteger(day) || day < 1 || day > maxDay) {
      continue;
    }
    matchingSpendCount += 1;
    if (tx.type === "expense") {
      netMinor += tx.amount_minor;
    } else {
      netMinor -= tx.amount_minor;
    }
  }

  return { netMinor, matchingSpendCount };
}

export function computeSamePeriodComparison(
  currentMonth: string,
  currentTxs: Transaction[],
  prevMonth: string,
  prevTxs: Transaction[],
  elapsedDay: number,
): SamePeriodComparison {
  const isPastMonth =
    YYYY_MM_RE.test(currentMonth) && currentMonth < getCurrentMonth();
  const maxDay = isPastMonth
    ? 31
    : Math.max(0, Math.min(31, Math.floor(elapsedDay)));

  const current = sumPeriodNetSpending(currentTxs, currentMonth, maxDay);
  const prev = sumPeriodNetSpending(prevTxs, prevMonth, maxDay);

  const currentMinor = current.netMinor;
  const prevMinor = prev.netMinor;
  const deltaMinor = currentMinor - prevMinor;
  const hasPrevData = prev.matchingSpendCount > 0;
  const deltaRatio = prevMinor > 0 ? deltaMinor / prevMinor : null;

  return {
    currentMinor,
    prevMinor,
    deltaMinor,
    deltaRatio,
    hasPrevData,
  };
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useCapabilities() {
  return useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: fetchCapabilities,
    staleTime: 60_000,
    retry: false,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });
}

export function useMonthlySummary(month: string) {
  return useQuery({
    queryKey: queryKeys.summary(month),
    queryFn: () => fetchSummary(month),
    placeholderData: keepPreviousData,
  });
}

export function useRecentTransactions(month: string) {
  return useQuery({
    queryKey: queryKeys.recentTransactions(month),
    queryFn: () => fetchTransactions({ month, limit: 6 }),
    placeholderData: keepPreviousData,
  });
}

export function useMonthlyIncomes(month: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.monthlyIncomes(month),
    queryFn: () => fetchTransactions({ month, type: "income", limit: 100 }),
    enabled,
  });
}

export function useTodayTransactions(todayDate: string) {
  const month = todayDate.slice(0, 7);
  return useQuery({
    queryKey: queryKeys.todayTransactions(month, todayDate),
    queryFn: () => fetchTransactions({ month, limit: 50 }),
    select: (page) =>
      page.items.filter((tx) => tx.transaction_date === todayDate),
    placeholderData: keepPreviousData,
  });
}

export function useMonthTransactions(month: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.monthTransactions(month),
    queryFn: ({ signal }) => fetchMonthTransactions(month, signal),
    enabled: enabled && YYYY_MM_RE.test(month),
  });
}

export function useMultiMonthSummaries(
  endMonth: string,
  count = 6,
  enabled = true,
): MultiMonthSummariesResult {
  const months = useMemo(() => {
    const safeCount = Math.max(0, Math.floor(count));
    if (safeCount === 0 || !YYYY_MM_RE.test(endMonth)) {
      return [] as string[];
    }
    const ordered: string[] = [];
    for (let offset = safeCount - 1; offset >= 0; offset -= 1) {
      ordered.push(shiftMonth(endMonth, -offset));
    }
    return ordered;
  }, [endMonth, count]);

  const queries = useQueries({
    queries: months.map((month) => ({
      queryKey: queryKeys.summary(month),
      queryFn: () => fetchSummary(month),
      enabled,
    })),
  });

  const items: MultiMonthSummaryItem[] = months.map((month, index) => {
    const result = queries[index];
    return {
      month,
      summary: result?.data,
      isLoading: result ? result.isLoading : false,
    };
  });

  const isLoading = items.some((item) => item.isLoading);

  return {
    months,
    items,
    isLoading,
  };
}

export function useTransactionsInfinite(filters: LedgerFilterInput) {
  const limit = filters.limit ?? 25;
  return useInfiniteQuery({
    queryKey: queryKeys.transactions({ ...filters, limit }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchTransactions({
        month: filters.month,
        category_id: filters.category_id,
        type: filters.type,
        limit,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}

export function useTransactionDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.transaction(id),
    queryFn: () => fetchTransactionById(id!),
    enabled: Boolean(id),
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTransactionPayload) =>
      createTransaction(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateTransactionPayload;
    }) => updateTransaction(id, payload),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.transaction(variables.id),
        }),
      ]);
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
  });
}

export function useBatchTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BatchTransactionsPayload) => batchTransactions(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
  });
}
