import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Category, Transaction, TransactionType } from "@/lib/api";
import { getCategoryColor } from "@/lib/category-colors";
import {
  formatLocalDate,
  formatSignedTransactionAmount,
  TRANSACTION_TYPE_META,
} from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type CommandPaletteNavView =
  | "overview"
  | "ledger"
  | "budgets"
  | "reports"
  | "settings";

export interface CommandPaletteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  activeView: string;
  canWrite: boolean;
  transactions: Transaction[];
  categories: Category[];
  onNavigate: (view: CommandPaletteNavView) => void;
  onOpenQuickAdd: (defaultType?: TransactionType) => void;
  onOpenMonthlyIncome: () => void;
  onOpenShortcuts: () => void;
  onSelectTransaction: (id: string) => void;
  onSearchInLedger: (query: string) => void;
}

interface QuickCommandItem {
  kind: "command";
  id: string;
  label: string;
  detail?: string;
  shortcut?: string;
  isCurrent?: boolean;
  keywords: string;
  run: () => void;
}

interface TransactionResultItem {
  kind: "transaction";
  id: string;
  tx: Transaction;
  categoryName: string;
  run: () => void;
}

interface SearchLedgerItem {
  kind: "search-ledger";
  id: string;
  query: string;
  run: () => void;
}

type PaletteItem =
  | QuickCommandItem
  | TransactionResultItem
  | SearchLedgerItem;

function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesQuery(haystack: string, rawQuery: string): boolean {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return true;
  }
  const lower = haystack.toLowerCase();
  const qLower = trimmed.toLowerCase();
  if (lower.includes(qLower)) {
    return true;
  }
  return normalizeSearchText(haystack).includes(normalizeSearchText(trimmed));
}

export function CommandPaletteDialog({
  open,
  onOpenChange,
  initialQuery = "",
  activeView,
  canWrite,
  transactions,
  categories,
  onNavigate,
  onOpenQuickAdd,
  onOpenMonthlyIncome,
  onOpenShortcuts,
  onSelectTransaction,
  onSearchInLedger,
}: CommandPaletteDialogProps) {
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setActiveIndex(0);
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [open, initialQuery]);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const commandItems = useMemo<QuickCommandItem[]>(() => {
    const items: QuickCommandItem[] = [
      {
        kind: "command",
        id: "nav-overview",
        label: "bảng điều khiển",
        detail: "chuyển trang",
        shortcut: "d",
        isCurrent: activeView === "overview",
        keywords: "bang dieu khien overview dashboard trang chu tong quan d",
        run: () => onNavigate("overview"),
      },
      {
        kind: "command",
        id: "nav-ledger",
        label: "giao dịch",
        detail: "chuyển trang",
        shortcut: "t",
        isCurrent: activeView === "ledger",
        keywords: "giao dich so giao dich ledger transactions t",
        run: () => onNavigate("ledger"),
      },
      {
        kind: "command",
        id: "nav-budgets",
        label: "ngân sách",
        detail: "chuyển trang",
        shortcut: "b",
        isCurrent: activeView === "budgets",
        keywords: "ngan sach budgets han muc b",
        run: () => onNavigate("budgets"),
      },
      {
        kind: "command",
        id: "nav-reports",
        label: "báo cáo",
        detail: "chuyển trang",
        shortcut: "r",
        isCurrent: activeView === "reports",
        keywords: "bao cao reports phan tich thong ke r",
        run: () => onNavigate("reports"),
      },
      {
        kind: "command",
        id: "nav-settings",
        label: "cài đặt",
        detail: "chuyển trang",
        shortcut: "s",
        isCurrent: activeView === "settings",
        keywords: "cai dat settings cau hinh danh muc s",
        run: () => onNavigate("settings"),
      },
      {
        kind: "command",
        id: "action-theme",
        label: "chuyển giao diện sáng / tối",
        detail: theme === "dark" ? "đang tối → sáng" : "đang sáng → tối",
        shortcut: "l",
        keywords: "chuyen giao dien sang toi theme dark light l",
        run: () => toggleTheme(),
      },
    ];

    if (canWrite) {
      items.push(
        {
          kind: "command",
          id: "action-quick-add",
          label: "+ thêm khoản chi",
          detail: "tạo mới",
          shortcut: "n",
          keywords: "them khoan chi giao dich moi add expense quick n",
          run: () => onOpenQuickAdd("expense"),
        },
        {
          kind: "command",
          id: "action-monthly-income",
          label: "đặt thu nhập tháng",
          detail: "lương & thu nhập",
          shortcut: "m",
          keywords: "dat thu nhap thang luong salary income m",
          run: () => onOpenMonthlyIncome(),
        },
      );
    }

    items.push({
      kind: "command",
      id: "action-shortcuts",
      label: "xem phím tắt",
      detail: "trợ giúp",
      shortcut: "?",
      keywords: "xem phim tat shortcuts help ?",
      run: () => onOpenShortcuts(),
    });

    return items.filter((item) =>
      matchesQuery(
        `${item.label} ${item.detail ?? ""} ${item.keywords}`,
        query,
      ),
    );
  }, [
    activeView,
    canWrite,
    onNavigate,
    onOpenMonthlyIncome,
    onOpenQuickAdd,
    onOpenShortcuts,
    query,
    theme,
    toggleTheme,
  ]);

  const matchingTransactions = useMemo<TransactionResultItem[]>(() => {
    const matched: TransactionResultItem[] = [];
    for (const tx of transactions) {
      const catName = tx.category_id
        ? (categoryMap.get(tx.category_id)?.name ?? tx.category_id)
        : "chưa phân loại";
      const searchable = [
        tx.merchant ?? "",
        tx.note ?? "",
        catName,
        tx.transaction_date,
        formatLocalDate(tx.transaction_date, "full"),
        String(tx.amount_minor),
      ].join(" ");
      if (matchesQuery(searchable, query)) {
        matched.push({
          kind: "transaction",
          id: `tx-${tx.id}`,
          tx,
          categoryName: catName,
          run: () => onSelectTransaction(tx.id),
        });
        if (matched.length >= 6) {
          break;
        }
      }
    }
    return matched;
  }, [transactions, categoryMap, query, onSelectTransaction]);

  const trimmedQuery = query.trim();

  const searchLedgerItem = useMemo<SearchLedgerItem | null>(() => {
    if (!trimmedQuery) {
      return null;
    }
    return {
      kind: "search-ledger",
      id: "action-search-ledger",
      query: trimmedQuery,
      run: () => onSearchInLedger(trimmedQuery),
    };
  }, [trimmedQuery, onSearchInLedger]);

  const flatItems = useMemo<PaletteItem[]>(() => {
    const all: PaletteItem[] = [...commandItems, ...matchingTransactions];
    if (searchLedgerItem) {
      all.push(searchLedgerItem);
    }
    return all;
  }, [commandItems, matchingTransactions, searchLedgerItem]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= flatItems.length && flatItems.length > 0) {
      setActiveIndex(flatItems.length - 1);
    }
  }, [activeIndex, flatItems.length]);

  useEffect(() => {
    const activeEl = itemRefs.current[activeIndex];
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  function executeItem(item: PaletteItem | undefined) {
    if (!item) {
      return;
    }
    onOpenChange(false);
    item.run();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (flatItems.length === 0) {
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(flatItems.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeItem(flatItems[activeIndex]);
    }
  }

  let runningIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        floatingTitle="tìm kiếm & lệnh"
        hideCloseButton
        onKeyDown={handleKeyDown}
        className="w-[min(640px,calc(100vw-2rem))] max-w-[640px] p-0"
      >
        <DialogDescription className="sr-only">
          tìm nhanh giao dịch hoặc chạy lệnh điều hướng bằng bàn phím
        </DialogDescription>

        <div className="flex max-h-[85vh] flex-col">
          <div className="border-b border-[var(--border)] px-5 pt-6 pb-4">
            <div className="tally-search w-full">
              <span className="text-[var(--muted)]" aria-hidden="true">
                /
              </span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="tìm kiếm giao dịch hoặc gõ lệnh..."
                aria-label="tìm kiếm hoặc chạy lệnh"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  xóa
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="tally-kbd cursor-pointer hover:text-[var(--text)]"
                aria-label="đóng"
              >
                esc
              </button>
            </div>
          </div>

          <div
            role="listbox"
            aria-label="kết quả tìm kiếm và lệnh"
            className="flex-1 overflow-y-auto px-5 py-3"
          >
            {flatItems.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[var(--muted)]">
                ∅ không có lệnh hoặc giao dịch phù hợp.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {commandItems.length > 0 ? (
                  <div>
                    <div className="mb-1.5 text-[11px] text-[var(--muted)]">
                      lệnh nhanh
                    </div>
                    <div className="border-t border-dashed border-[var(--border)]">
                      {commandItems.map((item) => {
                        const idx = runningIndex++;
                        const isActive = idx === activeIndex;
                        return (
                          <button
                            key={item.id}
                            ref={(el) => {
                              itemRefs.current[idx] = el;
                            }}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => executeItem(item)}
                            className={cn(
                              "tally-row flex w-full items-center justify-between gap-3 border-l-2 px-2.5 py-2 text-left text-[13px] transition-colors cursor-pointer",
                              isActive
                                ? "border-l-[var(--accent)] bg-[var(--panel)] text-[var(--text)]"
                                : "border-l-transparent bg-transparent text-[var(--text)] hover:bg-[var(--panel)]",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate">{item.label}</span>
                              {item.isCurrent ? (
                                <span className="tally-tag">đang mở</span>
                              ) : item.detail ? (
                                <span className="text-[11px] text-[var(--muted)]">
                                  · {item.detail}
                                </span>
                              ) : null}
                            </span>
                            {item.shortcut ? (
                              <span className="tally-kbd">{item.shortcut}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {matchingTransactions.length > 0 || searchLedgerItem ? (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--muted)]">
                      <span>
                        {trimmedQuery
                          ? `giao dịch khớp (${matchingTransactions.length})`
                          : "giao dịch gần đây"}
                      </span>
                    </div>
                    <div className="border-t border-dashed border-[var(--border)]">
                      {matchingTransactions.map((item) => {
                        const idx = runningIndex++;
                        const isActive = idx === activeIndex;
                        const { tx, categoryName } = item;
                        const label =
                          tx.merchant?.trim() ||
                          tx.note?.trim() ||
                          categoryName.toLowerCase();

                        return (
                          <button
                            key={item.id}
                            ref={(el) => {
                              itemRefs.current[idx] = el;
                            }}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => executeItem(item)}
                            className={cn(
                              "tally-row grid w-full grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3 border-l-2 px-2.5 py-2 text-left text-[13px] transition-colors cursor-pointer sm:grid-cols-[84px_minmax(0,1fr)_128px_112px]",
                              isActive
                                ? "border-l-[var(--accent)] bg-[var(--panel)] text-[var(--text)]"
                                : "border-l-transparent bg-transparent text-[var(--text)] hover:bg-[var(--panel)]",
                            )}
                          >
                            <span className="tally-num shrink-0 whitespace-nowrap text-[12px] text-[var(--muted)]">
                              {formatLocalDate(tx.transaction_date, "full")}
                            </span>
                            <span className="truncate">{label}</span>
                            <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
                              {tx.category_id ? (
                                <>
                                  <span
                                    className="tally-sw"
                                    style={{
                                      backgroundColor: getCategoryColor(
                                        tx.category_id,
                                        categoryName,
                                      ),
                                    }}
                                    aria-hidden="true"
                                  />
                                  <span className="truncate text-[12px] text-[var(--muted)] lowercase">
                                    {categoryName}
                                  </span>
                                </>
                              ) : (
                                <span className="truncate text-[12px] text-[var(--muted)]">
                                  — chưa phân loại
                                </span>
                              )}
                            </span>
                            <span
                              className={cn(
                                "tally-num text-right text-[12px]",
                                TRANSACTION_TYPE_META[tx.type].amountClass,
                              )}
                            >
                              {formatSignedTransactionAmount(
                                tx.amount_minor,
                                tx.currency_code,
                                tx.type,
                              )}
                            </span>
                          </button>
                        );
                      })}

                      {searchLedgerItem
                        ? (() => {
                            const idx = runningIndex++;
                            const isActive = idx === activeIndex;
                            return (
                              <button
                                key={searchLedgerItem.id}
                                ref={(el) => {
                                  itemRefs.current[idx] = el;
                                }}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onMouseEnter={() => setActiveIndex(idx)}
                                onClick={() => executeItem(searchLedgerItem)}
                                className={cn(
                                  "tally-row flex w-full items-center justify-between gap-3 border-l-2 px-2.5 py-2.5 text-left text-[13px] transition-colors cursor-pointer",
                                  isActive
                                    ? "border-l-[var(--accent)] bg-[var(--panel)] text-[var(--accent)]"
                                    : "border-l-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]",
                                )}
                              >
                                <span className="truncate">
                                  tìm &lsquo;{searchLedgerItem.query}&rsquo;
                                  trong sổ giao dịch →
                                </span>
                                <span className="tally-kbd">⏎</span>
                              </button>
                            );
                          })()
                        : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--panel)] px-5 py-2.5 text-[11px] text-[var(--muted)]">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                <span className="tally-kbd">↑</span>{" "}
                <span className="tally-kbd">↓</span> di chuyển
              </span>
              <span>
                <span className="tally-kbd">⏎</span> chọn
              </span>
              <span>
                <span className="tally-kbd">esc</span> đóng
              </span>
            </div>
            <span className="tally-num">{flatItems.length} mục</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
