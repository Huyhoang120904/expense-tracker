import { useEffect, useMemo, useRef, useState } from "react";
import { SummaryMetrics } from "@/components/summary-metrics";
import { DateInput } from "@/components/ui/date-input";
import { Pane } from "@/components/ui/pane";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useBatchTransactions,
  useMonthlySummary,
  useTransactionsInfinite,
} from "@/hooks/use-ledger";
import type {
  BatchUpdateTransactionPatch,
  Category,
  TransactionType,
} from "@/lib/api";
import { getCategoryColor } from "@/lib/category-colors";
import {
  formatLocalDate,
  formatMoney,
  formatMonthShort,
  getCurrentMonth,
  getTodayLocalDate,
  getYesterdayLocalDate,
  TRANSACTION_SOURCE_LABELS,
  TRANSACTION_TYPE_META,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type TypeFilterValue = "all" | TransactionType;
type MonthScope = "month" | "all";

const MAX_BATCH_SELECT = 100;

const TYPE_OPTIONS: ReadonlyArray<{ value: TypeFilterValue; label: string }> = [
  { value: "all", label: "tất cả" },
  { value: "expense", label: "chi tiêu" },
  { value: "income", label: "thu nhập" },
  { value: "refund", label: "hoàn tiền" },
  { value: "transfer", label: "chuyển khoản" },
];

const BATCH_TYPE_OPTIONS: ReadonlyArray<{
  value: TransactionType;
  label: string;
}> = [
  { value: "expense", label: "chi tiêu" },
  { value: "income", label: "thu nhập" },
  { value: "refund", label: "hoàn tiền" },
  { value: "transfer", label: "chuyển khoản" },
];

export interface LedgerViewProps {
  month: string;
  onMonthChange: (nextMonth: string) => void;
  categoryFilter: string | undefined;
  onCategoryFilterChange: (categoryId: string | undefined) => void;
  typeFilter: TypeFilterValue;
  onTypeFilterChange: (nextType: TypeFilterValue) => void;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  categories: Category[];
  canWrite: boolean;
  onOpenQuickAdd: () => void;
  onOpenMonthlyIncome: () => void;
  onSelectTransaction: (id: string) => void;
  onNotify?: (message: string, tone?: "success" | "warn" | "error") => void;
}

export function LedgerView({
  month,
  onMonthChange,
  categoryFilter,
  onCategoryFilterChange,
  typeFilter,
  onTypeFilterChange,
  searchTerm,
  onSearchTermChange,
  categories,
  canWrite,
  onOpenQuickAdd,
  onOpenMonthlyIncome,
  onSelectTransaction,
  onNotify,
}: LedgerViewProps) {
  const [monthScope, setMonthScope] = useState<MonthScope>("month");
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [batchCategoryOpen, setBatchCategoryOpen] = useState(false);
  const [batchTypeOpen, setBatchTypeOpen] = useState(false);
  const [batchDateOpen, setBatchDateOpen] = useState(false);
  const [batchDateValue, setBatchDateValue] = useState<string>(() =>
    getTodayLocalDate(),
  );
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const shiftKeyRef = useRef(false);

  const isControlledSearch = searchTerm !== undefined;
  const effectiveSearchTerm = isControlledSearch ? searchTerm : localSearchTerm;

  function handleSearchChange(nextValue: string) {
    if (!isControlledSearch) {
      setLocalSearchTerm(nextValue);
    }
    onSearchTermChange?.(nextValue);
  }

  const activeMonth = monthScope === "month" ? month : undefined;
  const activeType = typeFilter === "all" ? undefined : typeFilter;

  const summaryQuery = useMonthlySummary(month);
  const ledgerQuery = useTransactionsInfinite({
    month: activeMonth,
    category_id: categoryFilter,
    type: activeType,
    limit: 25,
  });
  const batchMutation = useBatchTransactions();

  const categoryMap = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories],
  );
  const activeCategories = useMemo(
    () => categories.filter((c) => !c.archived),
    [categories],
  );
  const archivedCategories = useMemo(
    () => categories.filter((c) => c.archived),
    [categories],
  );

  const loadedRows = useMemo(
    () => ledgerQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [ledgerQuery.data],
  );

  const normalizedQuery = effectiveSearchTerm.trim().toLowerCase();
  const visibleRows = useMemo(() => {
    if (!normalizedQuery) {
      return loadedRows;
    }
    return loadedRows.filter((tx) => {
      const catName =
        tx.category_id !== null
          ? (categoryMap.get(tx.category_id)?.name ?? tx.category_id)
          : "chưa phân loại";
      return (
        (tx.merchant ?? "").toLowerCase().includes(normalizedQuery) ||
        (tx.note ?? "").toLowerCase().includes(normalizedQuery) ||
        catName.toLowerCase().includes(normalizedQuery) ||
        tx.id.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [loadedRows, normalizedQuery, categoryMap]);

  const selectedVisibleRows = useMemo(
    () => (canWrite ? visibleRows.filter((tx) => selectedIds.has(tx.id)) : []),
    [canWrite, visibleRows, selectedIds],
  );
  const selectedVisibleIds = useMemo(
    () => selectedVisibleRows.map((tx) => tx.id),
    [selectedVisibleRows],
  );
  const selectedVisibleIdSet = useMemo(
    () => new Set(selectedVisibleIds),
    [selectedVisibleIds],
  );
  const selectableVisibleRows = useMemo(
    () => visibleRows.slice(0, MAX_BATCH_SELECT),
    [visibleRows],
  );
  const allSelectableSelected =
    selectableVisibleRows.length > 0 &&
    selectableVisibleRows.every((tx) => selectedIds.has(tx.id));
  const someSelectableSelected =
    selectableVisibleRows.some((tx) => selectedIds.has(tx.id)) &&
    !allSelectableSelected;

  const selectedCurrencyCode =
    selectedVisibleRows.length > 0 &&
    selectedVisibleRows.every(
      (tx) => tx.currency_code === selectedVisibleRows[0]?.currency_code,
    )
      ? selectedVisibleRows[0]!.currency_code
      : null;

  const selectedNetMinor = useMemo(() => {
    let net = 0;
    for (const tx of selectedVisibleRows) {
      if (tx.type === "expense") {
        net -= tx.amount_minor;
      } else if (tx.type === "income" || tx.type === "refund") {
        net += tx.amount_minor;
      }
    }
    return net;
  }, [selectedVisibleRows]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelectableSelected;
    }
  }, [someSelectableSelected]);

  function clearSelection() {
    setSelectedIds(new Set());
    setLastSelectedId(null);
    setConfirmBatchDelete(false);
    setBatchError(null);
    setBatchCategoryOpen(false);
    setBatchTypeOpen(false);
    setBatchDateOpen(false);
  }

  useEffect(() => {
    if (!canWrite || selectedVisibleIds.length === 0) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (
        batchCategoryOpen ||
        batchTypeOpen ||
        batchDateOpen ||
        categoryPopoverOpen ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLInputElement && active.type !== "checkbox")
      ) {
        return;
      }
      event.preventDefault();
      clearSelection();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canWrite,
    selectedVisibleIds.length,
    batchCategoryOpen,
    batchTypeOpen,
    batchDateOpen,
    categoryPopoverOpen,
  ]);

  function toggleRowSelection(txId: string, shiftKey: boolean) {
    setConfirmBatchDelete(false);
    setBatchError(null);

    if (shiftKey && lastSelectedId) {
      const anchorIndex = visibleRows.findIndex((tx) => tx.id === lastSelectedId);
      const targetIndex = visibleRows.findIndex((tx) => tx.id === txId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const next = new Set(selectedVisibleIds);
        let hitLimit = false;
        for (let idx = start; idx <= end; idx += 1) {
          const rowId = visibleRows[idx]!.id;
          if (!next.has(rowId)) {
            if (next.size >= MAX_BATCH_SELECT) {
              hitLimit = true;
              break;
            }
            next.add(rowId);
          }
        }
        setSelectedIds(next);
        setLastSelectedId(txId);
        if (hitLimit) {
          onNotify?.(
            `đã chọn tối đa ${MAX_BATCH_SELECT} giao dịch mỗi lần thao tác.`,
            "warn",
          );
        }
        return;
      }
    }

    const next = new Set(selectedVisibleIds);
    if (next.has(txId)) {
      next.delete(txId);
    } else {
      if (next.size >= MAX_BATCH_SELECT) {
        onNotify?.(
          `tối đa chọn ${MAX_BATCH_SELECT} giao dịch mỗi lần thao tác.`,
          "warn",
        );
        return;
      }
      next.add(txId);
    }
    setSelectedIds(next);
    setLastSelectedId(txId);
  }

  function toggleSelectAll() {
    setConfirmBatchDelete(false);
    setBatchError(null);
    if (allSelectableSelected) {
      setSelectedIds(new Set());
      setLastSelectedId(null);
      return;
    }
    setSelectedIds(new Set(selectableVisibleRows.map((tx) => tx.id)));
    setLastSelectedId(
      selectableVisibleRows[selectableVisibleRows.length - 1]?.id ?? null,
    );
    if (visibleRows.length > MAX_BATCH_SELECT) {
      onNotify?.(
        `đã chọn ${MAX_BATCH_SELECT} giao dịch đầu tiên (giới hạn mỗi lần).`,
        "warn",
      );
    }
  }

  async function runBatchUpdate(
    patch: BatchUpdateTransactionPatch,
    formatSuccess: (affected: number) => string,
  ) {
    if (selectedVisibleIds.length === 0 || batchMutation.isPending) {
      return;
    }
    setConfirmBatchDelete(false);
    setBatchError(null);
    try {
      const result = await batchMutation.mutateAsync({
        action: "update",
        ids: selectedVisibleIds,
        patch,
      });
      clearSelection();
      onNotify?.(formatSuccess(result.affected), "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "không thể cập nhật hàng loạt.";
      setBatchError(message);
      onNotify?.(message, "error");
    }
  }

  async function handleBatchDelete() {
    if (selectedVisibleIds.length === 0 || batchMutation.isPending) {
      return;
    }
    setBatchError(null);
    try {
      const result = await batchMutation.mutateAsync({
        action: "delete",
        ids: selectedVisibleIds,
      });
      clearSelection();
      onNotify?.(`đã xóa ${result.affected} giao dịch.`, "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "không thể xóa hàng loạt.";
      setBatchError(message);
      onNotify?.(message, "error");
    }
  }

  const selectedCategory = categoryFilter
    ? categoryMap.get(categoryFilter)
    : undefined;
  const selectedCategoryLabel = categoryFilter
    ? (selectedCategory?.name ?? categoryFilter).toLowerCase()
    : "tất cả danh mục";

  const hasActiveFilters =
    Boolean(categoryFilter) ||
    typeFilter !== "all" ||
    effectiveSearchTerm.trim().length > 0 ||
    monthScope === "all";

  function handleResetFilters() {
    onCategoryFilterChange(undefined);
    onTypeFilterChange("all");
    handleSearchChange("");
    setMonthScope("month");
  }

  const currentMonth = getCurrentMonth();

  return (
    <div className="space-y-8">
      {monthScope === "month" ? (
        <SummaryMetrics
          variant="strip"
          summary={summaryQuery.data}
          isLoading={summaryQuery.isLoading}
          canWrite={canWrite}
          onOpenMonthlyIncome={onOpenMonthlyIncome}
        />
      ) : null}

      <Pane title="sổ giao dịch">
        <div className="space-y-3 border-b border-[var(--border)] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div
              className="tally-seg"
              role="group"
              aria-label="phạm vi thời gian"
            >
              <button
                type="button"
                aria-pressed={monthScope === "month"}
                onClick={() => setMonthScope("month")}
                className="tally-seg-btn text-[12px]"
              >
                theo tháng
              </button>
              <button
                type="button"
                aria-pressed={monthScope === "all"}
                onClick={() => setMonthScope("all")}
                className="tally-seg-btn text-[12px]"
              >
                tất cả các tháng
              </button>
            </div>

            <div
              className="tally-seg max-w-full overflow-x-auto"
              role="group"
              aria-label="lọc theo loại giao dịch"
            >
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={typeFilter === option.value}
                  onClick={() => onTypeFilterChange(option.value)}
                  className="tally-seg-btn text-[12px]"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Popover
              open={categoryPopoverOpen}
              onOpenChange={setCategoryPopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`lọc danh mục, hiện tại: ${selectedCategoryLabel}`}
                  className="tally-btn h-[36px] gap-2 px-3 text-[12px]"
                >
                  {categoryFilter ? (
                    <span
                      className="tally-sw"
                      style={{
                        backgroundColor: getCategoryColor(
                          categoryFilter,
                          selectedCategory?.name,
                        ),
                      }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="max-w-[160px] truncate">
                    {selectedCategoryLabel}
                  </span>
                  <span className="text-[var(--muted)]" aria-hidden="true">
                    ▾
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 rounded-none border border-[var(--bstrong)] bg-[var(--bg)] p-1.5"
              >
                <div className="max-h-72 space-y-0.5 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      onCategoryFilterChange(undefined);
                      setCategoryPopoverOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--panel)] cursor-pointer",
                      !categoryFilter
                        ? "bg-[var(--panel)] text-[var(--text)] font-semibold"
                        : "text-[var(--muted)]",
                    )}
                  >
                    <span>tất cả danh mục</span>
                    {!categoryFilter ? (
                      <span className="text-[var(--accent)]" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>

                  {activeCategories.length > 0 ? (
                    <div className="px-2.5 pt-2 pb-1 text-[11px] text-[var(--muted)]">
                      đang hoạt động
                    </div>
                  ) : null}

                  {activeCategories.map((cat) => {
                    const selected = categoryFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          onCategoryFilterChange(cat.id);
                          setCategoryPopoverOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--panel)] cursor-pointer",
                          selected
                            ? "bg-[var(--panel)] text-[var(--text)] font-semibold"
                            : "text-[var(--text)]",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="tally-sw"
                            style={{
                              backgroundColor: getCategoryColor(
                                cat.id,
                                cat.name,
                              ),
                            }}
                            aria-hidden="true"
                          />
                          <span className="truncate lowercase">{cat.name}</span>
                        </span>
                        {selected ? (
                          <span
                            className="shrink-0 text-[var(--accent)]"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        ) : null}
                      </button>
                    );
                  })}

                  {archivedCategories.length > 0 ? (
                    <div className="px-2.5 pt-2 pb-1 text-[11px] text-[var(--muted)]">
                      đã lưu trữ
                    </div>
                  ) : null}

                  {archivedCategories.map((cat) => {
                    const selected = categoryFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          onCategoryFilterChange(cat.id);
                          setCategoryPopoverOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--panel)] cursor-pointer",
                          selected
                            ? "bg-[var(--panel)] text-[var(--text)] font-semibold"
                            : "text-[var(--muted)]",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="tally-sw"
                            style={{
                              backgroundColor: getCategoryColor(
                                cat.id,
                                cat.name,
                              ),
                            }}
                            aria-hidden="true"
                          />
                          <span className="truncate lowercase">{cat.name}</span>
                        </span>
                        {selected ? (
                          <span
                            className="shrink-0 text-[var(--accent)]"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <label className="tally-search h-[36px] min-w-[200px] flex-1 sm:max-w-[300px]">
              <span className="sr-only">lọc theo nơi chi hoặc ghi chú</span>
              <span className="select-none text-[var(--muted)]" aria-hidden="true">
                /
              </span>
              <input
                type="search"
                value={effectiveSearchTerm}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="lọc nơi chi, ghi chú..."
                className="text-[12px]"
              />
              {effectiveSearchTerm ? (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  aria-label="xóa từ khóa tìm kiếm"
                  className="text-[12px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  ×
                </button>
              ) : null}
            </label>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="tally-btn h-[36px] px-3 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
              >
                đặt lại
              </button>
            ) : null}

            {canWrite ? (
              <button
                type="button"
                onClick={onOpenQuickAdd}
                className="tally-btn tally-btn-sm ml-auto h-[36px] px-3"
              >
                + thêm khoản chi
              </button>
            ) : null}
          </div>
        </div>

        <div className="pt-2">
          {ledgerQuery.isLoading ? (
            <div aria-busy="true">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="tally-row grid grid-cols-[88px_minmax(0,1fr)_110px] items-center gap-3 py-3 lg:grid-cols-[96px_minmax(0,1.4fr)_minmax(140px,0.9fr)_120px_136px]"
                >
                  <div className="tally-sk h-[14px] w-16" />
                  <div className="space-y-1.5">
                    <div className="tally-sk h-[14px] w-3/4" />
                    <div className="tally-sk h-[12px] w-1/2" />
                  </div>
                  <div className="tally-sk hidden h-[14px] w-24 lg:block" />
                  <div className="tally-sk hidden h-[14px] w-20 lg:block" />
                  <div className="tally-sk ml-auto h-[14px] w-20" />
                </div>
              ))}
              <p
                className="mt-3 text-[12px] text-[var(--muted)]"
                role="status"
              >
                đang tải giao dịch
                <span className="tally-cursor" aria-hidden="true">
                  █
                </span>
              </p>
            </div>
          ) : ledgerQuery.isError ? (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-[var(--red)] bg-[var(--panel)] p-4 text-[12px]"
            >
              <div className="space-y-1">
                <p className="tally-st-over font-semibold">
                  ✕ không thể tải giao dịch
                </p>
                <p className="text-[var(--muted)]">
                  {ledgerQuery.error instanceof Error
                    ? ledgerQuery.error.message
                    : "yêu cầu thất bại."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void ledgerQuery.refetch()}
                className="tally-btn tally-btn-sm"
              >
                thử lại
              </button>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="mt-3 space-y-4">
              <div className="border border-dashed border-[var(--bstrong)] bg-[var(--panel)] px-5 py-6">
                <p className="text-[15px] font-semibold text-[var(--text)]">
                  <span className="text-[var(--muted)]" aria-hidden="true">
                    ∅{" "}
                  </span>
                  không có giao dịch phù hợp
                </p>
                <p className="mt-1.5 max-w-[60ch] text-[12px] text-[var(--muted)]">
                  {normalizedQuery && ledgerQuery.hasNextPage
                    ? "chưa có dòng nào trong các trang đã tải khớp với từ khóa. hãy tải thêm hoặc xóa bộ lọc tìm kiếm."
                    : hasActiveFilters
                      ? "không có giao dịch khớp với bộ lọc hiện tại. hãy đặt lại bộ lọc hoặc mở rộng phạm vi thời gian."
                      : `chưa có giao dịch nào trong ${formatMonthShort(month)}.`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="tally-btn tally-btn-sm"
                  >
                    đặt lại bộ lọc
                  </button>
                ) : null}
                {monthScope === "month" && month !== currentMonth ? (
                  <button
                    type="button"
                    onClick={() => onMonthChange(currentMonth)}
                    className="tally-btn tally-btn-primary tally-btn-sm"
                  >
                    về tháng hiện tại
                  </button>
                ) : null}
                {monthScope === "month" ? (
                  <button
                    type="button"
                    onClick={() => setMonthScope("all")}
                    className="tally-btn tally-btn-sm"
                  >
                    tất cả các tháng
                  </button>
                ) : null}
                {canWrite ? (
                  <button
                    type="button"
                    onClick={onOpenQuickAdd}
                    className="tally-btn tally-btn-primary tally-btn-sm"
                  >
                    + thêm khoản chi
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div>
              {canWrite && selectedVisibleIds.length > 0 ? (
                <div
                  role="region"
                  aria-label="thao tác hàng loạt"
                  className="mt-2 mb-3 border border-[var(--bstrong)] border-l-[3px] border-l-[var(--accent)] bg-[var(--panel)] px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="tally-num font-semibold text-[var(--text)]">
                        đã chọn {selectedVisibleIds.length} giao dịch
                      </span>
                      {selectedCurrencyCode ? (
                        <span className="tally-num text-[var(--muted)]">
                          · ròng{" "}
                          {formatMoney(selectedNetMinor, selectedCurrencyCode, {
                            showPlus: selectedNetMinor > 0,
                          })}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Popover
                        open={batchCategoryOpen}
                        onOpenChange={(open) => {
                          setConfirmBatchDelete(false);
                          setBatchCategoryOpen(open);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={batchMutation.isPending}
                            className="tally-btn tally-btn-sm"
                          >
                            <span>đổi danh mục</span>
                            <span
                              className="text-[var(--muted)]"
                              aria-hidden="true"
                            >
                              ▾
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-64 rounded-none border border-[var(--bstrong)] bg-[var(--bg)] p-1.5"
                        >
                          <div className="max-h-72 space-y-0.5 overflow-y-auto">
                            <button
                              type="button"
                              disabled={batchMutation.isPending}
                              onClick={() =>
                                void runBatchUpdate(
                                  { category_id: null },
                                  (affected) =>
                                    `đã bỏ phân loại ${affected} giao dịch.`,
                                )
                              }
                              className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12px] text-[var(--muted)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text)] cursor-pointer"
                            >
                              <span>— chưa phân loại</span>
                            </button>
                            {activeCategories.map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                disabled={batchMutation.isPending}
                                onClick={() =>
                                  void runBatchUpdate(
                                    { category_id: cat.id },
                                    (affected) =>
                                      `đã đổi danh mục "${cat.name.toLowerCase()}" cho ${affected} giao dịch.`,
                                  )
                                }
                                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-[var(--text)] transition-colors hover:bg-[var(--panel)] cursor-pointer"
                              >
                                <span
                                  className="tally-sw"
                                  style={{
                                    backgroundColor: getCategoryColor(
                                      cat.id,
                                      cat.name,
                                    ),
                                  }}
                                  aria-hidden="true"
                                />
                                <span className="truncate lowercase">
                                  {cat.name}
                                </span>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      <Popover
                        open={batchTypeOpen}
                        onOpenChange={(open) => {
                          setConfirmBatchDelete(false);
                          setBatchTypeOpen(open);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={batchMutation.isPending}
                            className="tally-btn tally-btn-sm"
                          >
                            <span>đổi loại</span>
                            <span
                              className="text-[var(--muted)]"
                              aria-hidden="true"
                            >
                              ▾
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-48 rounded-none border border-[var(--bstrong)] bg-[var(--bg)] p-1.5"
                        >
                          <div className="space-y-0.5">
                            {BATCH_TYPE_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                disabled={batchMutation.isPending}
                                onClick={() =>
                                  void runBatchUpdate(
                                    { type: opt.value },
                                    (affected) =>
                                      `đã đổi loại "${opt.label}" cho ${affected} giao dịch.`,
                                  )
                                }
                                className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12px] text-[var(--text)] transition-colors hover:bg-[var(--panel)] cursor-pointer"
                              >
                                <span>{opt.label}</span>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      <Popover
                        open={batchDateOpen}
                        onOpenChange={(open) => {
                          setConfirmBatchDelete(false);
                          setBatchDateOpen(open);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={batchMutation.isPending}
                            className="tally-btn tally-btn-sm"
                          >
                            <span>đổi ngày</span>
                            <span
                              className="text-[var(--muted)]"
                              aria-hidden="true"
                            >
                              ▾
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-64 rounded-none border border-[var(--bstrong)] bg-[var(--bg)] p-3"
                        >
                          <div className="space-y-2.5">
                            <div>
                              <label
                                htmlFor="batch-date-input"
                                className="block text-[11px] text-[var(--muted)]"
                              >
                                ngày giao dịch mới
                              </label>
                              <DateInput
                                id="batch-date-input"
                                value={batchDateValue}
                                onChange={setBatchDateValue}
                                className="mt-1 h-[34px] border-[var(--bstrong)] bg-[var(--bg)] text-[12px]"
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setBatchDateValue(getTodayLocalDate())
                                }
                                className="tally-btn tally-btn-sm h-[28px] px-2 text-[11px]"
                              >
                                hôm nay
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setBatchDateValue(getYesterdayLocalDate())
                                }
                                className="tally-btn tally-btn-sm h-[28px] px-2 text-[11px]"
                              >
                                hôm qua
                              </button>
                              <button
                                type="button"
                                disabled={
                                  batchMutation.isPending ||
                                  !/^\d{4}-\d{2}-\d{2}$/.test(batchDateValue)
                                }
                                onClick={() =>
                                  void runBatchUpdate(
                                    { transaction_date: batchDateValue },
                                    (affected) =>
                                      `đã đổi ngày ${formatLocalDate(batchDateValue, "full")} cho ${affected} giao dịch.`,
                                  )
                                }
                                className="tally-btn tally-btn-primary tally-btn-sm ml-auto h-[28px] px-2.5 text-[11px]"
                              >
                                áp dụng
                              </button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>

                      {confirmBatchDelete ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={batchMutation.isPending}
                            onClick={() => void handleBatchDelete()}
                            className="tally-btn tally-btn-sm border-[var(--red)] text-[var(--red)]"
                          >
                            {batchMutation.isPending
                              ? "đang xóa..."
                              : `xác nhận xóa ${selectedVisibleIds.length}?`}
                          </button>
                          <button
                            type="button"
                            disabled={batchMutation.isPending}
                            onClick={() => setConfirmBatchDelete(false)}
                            className="tally-btn tally-btn-sm text-[var(--muted)]"
                          >
                            hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={batchMutation.isPending}
                          onClick={() => {
                            setBatchError(null);
                            setConfirmBatchDelete(true);
                          }}
                          className="tally-btn tally-btn-sm border-[var(--red)] text-[var(--red)]"
                        >
                          xóa {selectedVisibleIds.length} mục
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={batchMutation.isPending}
                        onClick={clearSelection}
                        className="tally-btn tally-btn-sm text-[var(--muted)]"
                      >
                        <span>bỏ chọn</span>
                        <span
                          className="tally-kbd hidden sm:inline-flex"
                          aria-hidden="true"
                        >
                          esc
                        </span>
                      </button>
                    </div>
                  </div>

                  {batchError ? (
                    <p role="alert" className="tally-st-over mt-2 text-[12px]">
                      ✕ {batchError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {canWrite ? (
                <div className="tally-row flex items-center justify-between px-1 py-2 text-[12px] text-[var(--muted)] lg:hidden">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                    />
                    <span>
                      {allSelectableSelected
                        ? "bỏ chọn tất cả đang hiển thị"
                        : `chọn tất cả (${selectableVisibleRows.length})`}
                    </span>
                  </label>
                  <span className="text-[11px]">chạm vào ô để chọn nhiều</span>
                </div>
              ) : null}

              <div className="tally-row hidden min-h-[32px] items-center text-[12px] text-[var(--muted)] lg:flex">
                {canWrite ? (
                  <label
                    className="flex w-9 shrink-0 cursor-pointer items-center justify-center pl-1"
                    title="chọn tất cả giao dịch đang hiển thị (tối đa 100)"
                  >
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelectableSelected}
                      onChange={toggleSelectAll}
                      aria-label="chọn tất cả giao dịch đang hiển thị"
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                    />
                  </label>
                ) : null}
                <div
                  aria-hidden="true"
                  className="grid min-w-0 flex-1 grid-cols-[96px_minmax(0,1.4fr)_minmax(140px,0.9fr)_124px_136px] items-center gap-3 px-2"
                >
                  <span>ngày</span>
                  <span>nơi chi & ghi chú</span>
                  <span>danh mục</span>
                  <span>nguồn</span>
                  <span className="text-right">số tiền</span>
                </div>
              </div>

              <ul>
                {visibleRows.map((tx) => {
                  const typeMeta = TRANSACTION_TYPE_META[tx.type];
                  const category =
                    tx.category_id !== null
                      ? categoryMap.get(tx.category_id)
                      : undefined;
                  const displayMerchant =
                    tx.merchant?.trim() || category?.name || typeMeta.label;
                  const isPositiveFlow =
                    tx.type === "income" || tx.type === "refund";
                  const isExpense = tx.type === "expense";
                  const isSelected = selectedVisibleIdSet.has(tx.id);

                  const formattedAmountNode = isPositiveFlow ? (
                    <span className="text-[var(--text)]">
                      <span className="text-[var(--green)]">+</span>
                      {formatMoney(tx.amount_minor, tx.currency_code)}
                    </span>
                  ) : isExpense ? (
                    <span className="text-[var(--text)]">
                      {formatMoney(-tx.amount_minor, tx.currency_code)}
                    </span>
                  ) : (
                    <span className="text-[var(--muted)]">
                      {formatMoney(tx.amount_minor, tx.currency_code)}
                    </span>
                  );

                  return (
                    <li
                      key={tx.id}
                      className={cn(
                        "tally-row flex items-stretch",
                        isSelected &&
                          "border-l-2 border-l-[var(--accent)] bg-[var(--panel)]",
                      )}
                    >
                      {canWrite ? (
                        <label
                          className="flex w-9 shrink-0 cursor-pointer items-center justify-center pl-1"
                          title="chọn giao dịch (giữ Shift để chọn khoảng)"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onMouseDown={(e) => {
                              shiftKeyRef.current = e.shiftKey;
                            }}
                            onClick={(e) => {
                              shiftKeyRef.current = e.shiftKey;
                            }}
                            onChange={() => {
                              const isShift = shiftKeyRef.current;
                              shiftKeyRef.current = false;
                              toggleRowSelection(tx.id, isShift);
                            }}
                            aria-label={`chọn giao dịch ${displayMerchant}`}
                            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                          />
                        </label>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => onSelectTransaction(tx.id)}
                        className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 px-2 py-2.5 text-left transition-colors hover:bg-[var(--panel)] focus-visible:bg-[var(--panel)] lg:grid-cols-[96px_minmax(0,1.4fr)_minmax(140px,0.9fr)_124px_136px] lg:items-center lg:gap-3 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2 lg:block">
                          <span className="tally-num text-[12px] text-[var(--muted)]">
                            {formatLocalDate(tx.transaction_date, "full")}
                          </span>
                          <span className="tally-num whitespace-nowrap text-[13px] lg:hidden">
                            {formattedAmountNode}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              title={displayMerchant}
                              className="min-w-0 truncate text-[13px] text-[var(--text)]"
                            >
                              {displayMerchant}
                            </span>
                            {tx.type !== "expense" ? (
                              <span
                                className={cn(
                                  "tally-tag shrink-0",
                                  isPositiveFlow && "text-[var(--green)]",
                                )}
                              >
                                {typeMeta.label}
                              </span>
                            ) : null}
                          </div>
                          {tx.note?.trim() ? (
                            <p
                              title={tx.note}
                              className="mt-0.5 truncate text-[12px] text-[var(--muted)]"
                            >
                              {tx.note}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex min-w-0 items-center justify-between gap-2 lg:justify-start">
                          {tx.category_id !== null ? (
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className="tally-sw"
                                style={{
                                  backgroundColor: getCategoryColor(
                                    tx.category_id,
                                    category?.name,
                                  ),
                                }}
                                aria-hidden="true"
                              />
                              <span className="truncate text-[12px] text-[var(--muted)] lowercase">
                                {category?.name ?? tx.category_id}
                              </span>
                              {category?.archived ? (
                                <span className="tally-tag shrink-0">
                                  lưu trữ
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-[12px] text-[var(--muted)]">
                              — chưa phân loại
                            </span>
                          )}

                          <span className="tally-tag shrink-0 lg:hidden">
                            {TRANSACTION_SOURCE_LABELS[tx.source]}
                          </span>
                        </div>

                        <div className="hidden lg:flex lg:items-center">
                          <span className="tally-tag">
                            {TRANSACTION_SOURCE_LABELS[tx.source]}
                          </span>
                        </div>

                        <div className="tally-num hidden whitespace-nowrap text-right text-[13px] lg:block">
                          {formattedAmountNode}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {loadedRows.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-[12px] text-[var(--muted)]">
              <span className="tally-num">
                hiển thị {visibleRows.length} / {loadedRows.length} giao dịch đã
                tải
              </span>

              {ledgerQuery.hasNextPage ? (
                <button
                  type="button"
                  disabled={ledgerQuery.isFetchingNextPage}
                  onClick={() => void ledgerQuery.fetchNextPage()}
                  className="tally-btn tally-btn-sm"
                >
                  {ledgerQuery.isFetchingNextPage ? (
                    <>
                      đang tải thêm
                      <span className="tally-cursor" aria-hidden="true">
                        █
                      </span>
                    </>
                  ) : (
                    "tải thêm giao dịch"
                  )}
                </button>
              ) : (
                <span>đã tải toàn bộ giao dịch phù hợp</span>
              )}
            </div>
          ) : null}
        </div>
      </Pane>
    </div>
  );
}
