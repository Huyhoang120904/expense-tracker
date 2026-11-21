import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Category, MonthlySummary } from "../lib/api";

export const BUDGETS_STORAGE_KEY = "tally.budgets.v1";

const BUDGETS_CHANGE_EVENT = "tally:budgets-changed";
const EMPTY_BUDGETS: Record<string, number> = Object.freeze({});

export type BudgetStatus = "over" | "warn" | "ok";

export interface BudgetItemUsage {
  categoryId: string;
  categoryName: string;
  spentMinor: number;
  budgetMinor: number;
  pct: number;
  barWidthPct: number;
  status: BudgetStatus;
  overMinor: number;
  remainingMinor: number;
}

export interface BudgetOverview {
  items: BudgetItemUsage[];
  overItems: BudgetItemUsage[];
  warnItems: BudgetItemUsage[];
  totalBudgetMinor: number;
  totalSpentInBudgetedMinor: number;
  hasBudgets: boolean;
}

export interface UseBudgetsResult {
  budgets: Record<string, number>;
  setCategoryBudget: (categoryId: string, amountMinor: number) => void;
  removeCategoryBudget: (categoryId: string) => void;
  resetBudgets: () => void;
  hasBudgets: boolean;
  totalBudgetMinor: number;
}

const STATUS_SEVERITY: Record<BudgetStatus, number> = {
  over: 2,
  warn: 1,
  ok: 0,
};

let cachedRaw: string | null | undefined = undefined;
let cachedSnapshot: Record<string, number> = EMPTY_BUDGETS;

function sanitizeBudgets(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return EMPTY_BUDGETS;
  }

  const sanitized: Record<string, number> = {};
  let hasEntries = false;

  for (const [categoryId, value] of Object.entries(
    input as Record<string, unknown>,
  )) {
    if (
      typeof categoryId === "string" &&
      categoryId.trim().length > 0 &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0
    ) {
      const rounded = Math.round(value);
      if (Number.isSafeInteger(rounded) && rounded > 0) {
        sanitized[categoryId] = rounded;
        hasEntries = true;
      }
    }
  }

  return hasEntries ? Object.freeze(sanitized) : EMPTY_BUDGETS;
}

function readBudgetsSnapshot(): Record<string, number> {
  if (typeof window === "undefined") {
    return EMPTY_BUDGETS;
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(BUDGETS_STORAGE_KEY);
  } catch {
    return cachedSnapshot;
  }

  if (raw === cachedRaw) {
    return cachedSnapshot;
  }

  cachedRaw = raw;
  if (!raw) {
    cachedSnapshot = EMPTY_BUDGETS;
    return cachedSnapshot;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    cachedSnapshot = sanitizeBudgets(parsed);
  } catch {
    cachedSnapshot = EMPTY_BUDGETS;
  }

  return cachedSnapshot;
}

function getServerSnapshot(): Record<string, number> {
  return EMPTY_BUDGETS;
}

function persistBudgets(next: Record<string, number>): void {
  const sanitized = sanitizeBudgets(next);
  const serialized =
    Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : null;

  cachedRaw = serialized;
  cachedSnapshot = sanitized;

  if (typeof window === "undefined") {
    return;
  }

  try {
    if (serialized === null) {
      window.localStorage.removeItem(BUDGETS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(BUDGETS_STORAGE_KEY, serialized);
    }
  } catch {
    // Ignore storage quota / privacy mode write errors; in-memory state stays updated.
  }

  window.dispatchEvent(new CustomEvent(BUDGETS_CHANGE_EVENT));
}

function subscribeBudgets(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleLocalChange = () => {
    onStoreChange();
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === null || event.key === BUDGETS_STORAGE_KEY) {
      cachedRaw = undefined;
      onStoreChange();
    }
  };

  window.addEventListener(BUDGETS_CHANGE_EVENT, handleLocalChange);
  window.addEventListener("storage", handleStorageEvent);

  return () => {
    window.removeEventListener(BUDGETS_CHANGE_EVENT, handleLocalChange);
    window.removeEventListener("storage", handleStorageEvent);
  };
}

export function useBudgets(): UseBudgetsResult {
  const budgets = useSyncExternalStore(
    subscribeBudgets,
    readBudgetsSnapshot,
    getServerSnapshot,
  );

  const setCategoryBudget = useCallback(
    (categoryId: string, amountMinor: number) => {
      if (!categoryId || !categoryId.trim() || !Number.isFinite(amountMinor)) {
        return;
      }

      const rounded = Math.round(amountMinor);
      const current = readBudgetsSnapshot();

      if (rounded <= 0) {
        if (!(categoryId in current)) {
          return;
        }
        const next = { ...current };
        delete next[categoryId];
        persistBudgets(next);
        return;
      }

      if (!Number.isSafeInteger(rounded)) {
        return;
      }

      if (current[categoryId] === rounded) {
        return;
      }

      persistBudgets({ ...current, [categoryId]: rounded });
    },
    [],
  );

  const removeCategoryBudget = useCallback((categoryId: string) => {
    if (!categoryId) {
      return;
    }

    const current = readBudgetsSnapshot();
    if (!(categoryId in current)) {
      return;
    }

    const next = { ...current };
    delete next[categoryId];
    persistBudgets(next);
  }, []);

  const resetBudgets = useCallback(() => {
    persistBudgets(EMPTY_BUDGETS);
  }, []);

  const { hasBudgets, totalBudgetMinor } = useMemo(() => {
    const values = Object.values(budgets);
    let total = 0;
    for (const amount of values) {
      total += amount;
    }
    return {
      hasBudgets: values.length > 0,
      totalBudgetMinor: total,
    };
  }, [budgets]);

  return {
    budgets,
    setCategoryBudget,
    removeCategoryBudget,
    resetBudgets,
    hasBudgets,
    totalBudgetMinor,
  };
}

export function computeBudgetOverview(
  budgets: Record<string, number>,
  summary: MonthlySummary | undefined,
  categories: Category[],
): BudgetOverview {
  const categoryNameById = new Map<string, string>();
  for (const category of categories) {
    categoryNameById.set(category.id, category.name);
  }

  const spentByCategoryId = new Map<string, number>();
  if (summary) {
    for (const row of summary.by_category) {
      if (row.category_id !== null) {
        spentByCategoryId.set(row.category_id, row.net_spending_minor);
      }
    }
  }

  const items: BudgetItemUsage[] = [];

  for (const [categoryId, rawBudget] of Object.entries(budgets)) {
    if (
      !categoryId.trim() ||
      !Number.isFinite(rawBudget) ||
      rawBudget <= 0
    ) {
      continue;
    }

    const budgetMinor = Math.round(rawBudget);
    if (!Number.isSafeInteger(budgetMinor) || budgetMinor <= 0) {
      continue;
    }

    const spentMinor = spentByCategoryId.get(categoryId) ?? 0;
    const pct = (spentMinor / budgetMinor) * 100;
    const barWidthPct = Math.min(100, Math.max(0, pct));

    let status: BudgetStatus;
    if (spentMinor > budgetMinor) {
      status = "over";
    } else if (spentMinor * 5 >= budgetMinor * 4) {
      status = "warn";
    } else {
      status = "ok";
    }

    items.push({
      categoryId,
      categoryName: categoryNameById.get(categoryId) ?? categoryId,
      spentMinor,
      budgetMinor,
      pct,
      barWidthPct,
      status,
      overMinor: Math.max(0, spentMinor - budgetMinor),
      remainingMinor: Math.max(0, budgetMinor - spentMinor),
    });
  }

  items.sort((a, b) => {
    const severityDiff = STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    if (b.pct !== a.pct) {
      return b.pct - a.pct;
    }
    if (b.spentMinor !== a.spentMinor) {
      return b.spentMinor - a.spentMinor;
    }
    return a.categoryName.localeCompare(b.categoryName, "vi");
  });

  const overItems: BudgetItemUsage[] = [];
  const warnItems: BudgetItemUsage[] = [];
  let totalBudgetMinor = 0;
  let totalSpentInBudgetedMinor = 0;

  for (const item of items) {
    totalBudgetMinor += item.budgetMinor;
    totalSpentInBudgetedMinor += item.spentMinor;
    if (item.status === "over") {
      overItems.push(item);
    } else if (item.status === "warn") {
      warnItems.push(item);
    }
  }

  return {
    items,
    overItems,
    warnItems,
    totalBudgetMinor,
    totalSpentInBudgetedMinor,
    hasBudgets: items.length > 0,
  };
}
