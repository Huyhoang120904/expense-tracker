import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3,
  Home,
  List,
  Moon,
  PiggyBank,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CategoriesView } from "@/components/categories-view";
import { CommandPaletteDialog } from "@/components/command-palette-dialog";
import { LedgerView } from "@/components/ledger-view";
import { MonthPicker } from "@/components/month-picker";
import { MonthlyIncomeDialog } from "@/components/monthly-income-dialog";
import { OverviewView } from "@/components/overview-view";
import { QuickAddTodayDialog } from "@/components/quick-add-today-dialog";
import { ReportsView } from "@/components/reports-view";
import { SettingsView } from "@/components/settings-view";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { TransactionDetailDialog } from "@/components/transaction-detail-dialog";
import { computeBudgetOverview, useBudgets } from "@/hooks/use-budgets";
import {
  useCapabilities,
  useCategories,
  useHealth,
  useMonthTransactions,
  useMonthlySummary,
} from "@/hooks/use-ledger";
import { ApiClientError, type TransactionType } from "@/lib/api";
import {
  formatMoney,
  formatMonthShort,
  getCurrentMonth,
  getMonthElapsedDays,
} from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const APP_NAME = "Sổ Thu Chi";
const appIconUrl = new URL("./assets/so-thu-chi.png", import.meta.url).href;

export type NavView = "overview" | "ledger" | "budgets" | "reports" | "settings";
export type ToastTone = "success" | "warn" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const NAV_ITEMS: Array<{
  id: NavView;
  label: string;
  mobileLabel: string;
  kbd: string;
  icon: LucideIcon;
}> = [
  {
    id: "overview",
    label: "bảng điều khiển",
    mobileLabel: "tổng quan",
    kbd: "d",
    icon: Home,
  },
  {
    id: "ledger",
    label: "giao dịch",
    mobileLabel: "giao dịch",
    kbd: "t",
    icon: List,
  },
  {
    id: "budgets",
    label: "ngân sách",
    mobileLabel: "ngân sách",
    kbd: "b",
    icon: PiggyBank,
  },
  {
    id: "reports",
    label: "báo cáo",
    mobileLabel: "báo cáo",
    kbd: "r",
    icon: BarChart3,
  },
  {
    id: "settings",
    label: "cài đặt",
    mobileLabel: "cài đặt",
    kbd: "s",
    icon: Settings,
  },
];

const TOAST_DURATION_MS = 5000;
const MAX_BANNER_ITEMS = 3;

const TOAST_TONE_META: Record<ToastTone, { color: string; glyph: string }> = {
  success: { color: "var(--green)", glyph: "✓" },
  warn: { color: "var(--warn)", glyph: "▲" },
  error: { color: "var(--red)", glyph: "✕" },
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest('[contenteditable="true"], [role="textbox"]'));
}

function TallyToast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(TOAST_DURATION_MS);
  const [paused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const isExpired = remainingMs <= 0;

  useEffect(() => {
    if (isExpired) {
      onDismissRef.current();
    }
  }, [isExpired]);

  useEffect(() => {
    if (paused || isExpired) {
      return;
    }

    let lastTime = performance.now();
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;
      setRemainingMs((prev) => Math.max(0, prev - delta));
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [paused, isExpired]);

  const { color, glyph } = TOAST_TONE_META[toast.tone];
  const progressPct = Math.max(
    0,
    Math.min(100, (remainingMs / TOAST_DURATION_MS) * 100),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.14 }}
      className="fixed right-4 bottom-[calc(60px+env(safe-area-inset-bottom)+1rem)] z-50 w-[min(420px,calc(100vw-2rem))] md:right-6 md:bottom-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div
        role={toast.tone === "error" ? "alert" : "status"}
        aria-live={toast.tone === "error" ? "assertive" : "polite"}
        className="tally-toast"
        style={{ borderLeftColor: color }}
      >
        <span className="flex min-w-0 flex-1 items-start gap-2 text-[13px] text-[var(--text)]">
          <span
            aria-hidden="true"
            className="shrink-0"
            style={{ color }}
          >
            {glyph}
          </span>
          <span className="min-w-0 break-words">{toast.message}</span>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="đóng thông báo"
          className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[2px] border border-transparent text-[14px] leading-none text-[var(--muted)] transition-colors hover:border-[var(--bstrong)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
        >
          ×
        </button>
      </div>
      <div className="tally-toast-cd" aria-hidden="true">
        <i style={{ width: `${progressPct}%` }} />
      </div>
    </motion.div>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState<NavView>("overview");
  const [month, setMonth] = useState<string>(() => getCurrentMonth());
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(
    undefined,
  );
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddDefaultType, setQuickAddDefaultType] =
    useState<TransactionType>("expense");
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandInitialQuery, setCommandInitialQuery] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [trendTableToggleToken, setTrendTableToggleToken] = useState(0);
  const [toast, setToast] = useState<ToastItem | null>(null);
  const nextToastIdRef = useRef(1);

  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();
  const healthQuery = useHealth();
  const capabilitiesQuery = useCapabilities();
  const categoriesQuery = useCategories();
  const summaryQuery = useMonthlySummary(month);
  const monthTransactionsQuery = useMonthTransactions(month);
  const { budgets } = useBudgets();

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextToastIdRef.current;
    nextToastIdRef.current += 1;
    setToast({ id, message, tone });
  }, []);

  const canWrite = capabilitiesQuery.data?.can_write ?? false;

  const apiState: "checking" | "online" | "offline" = healthQuery.isLoading
    ? "checking"
    : healthQuery.data?.status === "ok"
      ? "online"
      : "offline";

  const authError =
    categoriesQuery.error instanceof ApiClientError &&
    (categoriesQuery.error.status === 503 ||
      categoriesQuery.error.status === 401)
      ? categoriesQuery.error
      : null;

  const categories = categoriesQuery.data ?? [];
  const currencyCode = summaryQuery.data?.currency_code ?? "VND";
  const monthTransactions = monthTransactionsQuery.data?.items ?? [];
  const monthTxCount = monthTransactions.length;
  const monthTxTruncated = monthTransactionsQuery.data?.truncated ?? false;
  const monthElapsed = getMonthElapsedDays(month);

  const activeNavLabel =
    NAV_ITEMS.find((item) => item.id === activeView)?.label ??
    "bảng điều khiển";

  useEffect(() => {
    const viewTitle =
      activeNavLabel.charAt(0).toUpperCase() + activeNavLabel.slice(1);
    document.title = `${APP_NAME} – ${viewTitle}`;
  }, [activeNavLabel]);

  const recentMerchants = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const tx of monthTransactions) {
      const name = tx.merchant?.trim();
      if (!name) {
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(name);
      if (result.length >= 5) {
        break;
      }
    }
    return result;
  }, [monthTransactions]);

  const budgetOverview = useMemo(
    () => computeBudgetOverview(budgets, summaryQuery.data, categories),
    [budgets, summaryQuery.data, categories],
  );

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const handleToggleTheme = useCallback(() => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    toggleTheme();
    notify(
      nextTheme === "light"
        ? "đã chuyển giao diện sáng"
        : "đã chuyển giao diện tối",
      "success",
    );
  }, [theme, toggleTheme, notify]);

  const openLedger = useCallback(
    (options?: { categoryId?: string; type?: "all" | TransactionType }) => {
      setCategoryFilter(options?.categoryId);
      setTypeFilter(options?.type ?? "all");
      setSearchTerm("");
      setActiveView("ledger");
    },
    [],
  );

  const openQuickAdd = useCallback((defaultType: TransactionType = "expense") => {
    setQuickAddDefaultType(defaultType);
    setQuickAddOpen(true);
  }, []);

  const openCommandPalette = useCallback((initialQuery = "") => {
    setCommandInitialQuery(initialQuery);
    setCommandOpen(true);
  }, []);

  const anyModalOpen =
    quickAddOpen ||
    incomeDialogOpen ||
    commandOpen ||
    shortcutsOpen ||
    selectedTransactionId !== null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setCommandOpen((prev) => {
          if (prev) {
            setCommandInitialQuery("");
            return false;
          }
          setShortcutsOpen(false);
          setCommandInitialQuery("");
          return true;
        });
        return;
      }

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      if (anyModalOpen || isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        openCommandPalette("");
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (event.shiftKey) {
        return;
      }

      const key = event.key.toLowerCase();
      switch (key) {
        case "d":
          event.preventDefault();
          setActiveView("overview");
          break;
        case "t":
          event.preventDefault();
          setActiveView("ledger");
          break;
        case "b":
          event.preventDefault();
          setActiveView("budgets");
          break;
        case "r":
          event.preventDefault();
          setActiveView("reports");
          break;
        case "s":
          event.preventDefault();
          setActiveView("settings");
          break;
        case "l":
          event.preventDefault();
          handleToggleTheme();
          break;
        case "n":
          if (canWrite) {
            event.preventDefault();
            openQuickAdd("expense");
          }
          break;
        case "m":
          if (canWrite) {
            event.preventDefault();
            setIncomeDialogOpen(true);
          }
          break;
        case "v":
          if (activeView === "overview") {
            event.preventDefault();
            setTrendTableToggleToken((prev) => prev + 1);
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeView,
    anyModalOpen,
    canWrite,
    handleToggleTheme,
    openCommandPalette,
    openQuickAdd,
  ]);

  const overIncome =
    summaryQuery.data !== undefined &&
    summaryQuery.data.income_minor > 0 &&
    summaryQuery.data.remaining_minor < 0;

  const hasBudgetAlerts =
    budgetOverview.overItems.length > 0 || budgetOverview.warnItems.length > 0;

  const showStatusBanner =
    apiState === "offline" ||
    Boolean(authError) ||
    hasBudgetAlerts ||
    overIncome;

  const overBannerParts = budgetOverview.overItems
    .slice(0, MAX_BANNER_ITEMS)
    .map(
      (item) =>
        `${item.categoryName.toLowerCase()} vượt ngân sách ${formatMoney(item.overMinor, currencyCode)}`,
    );
  const extraOverCount =
    budgetOverview.overItems.length - overBannerParts.length;

  const warnBannerParts = budgetOverview.warnItems
    .slice(0, MAX_BANNER_ITEMS)
    .map((item) =>
      item.pct >= 100
        ? `${item.categoryName.toLowerCase()} đã chạm hạn mức`
        : `${item.categoryName.toLowerCase()} ở mức ${Math.round(item.pct)}%`,
    );
  const extraWarnCount =
    budgetOverview.warnItems.length - warnBannerParts.length;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] pb-[calc(60px+env(safe-area-inset-bottom))] text-[var(--text)] md:flex-row md:pb-0">
      <aside className="flex flex-col justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2 md:sticky md:top-0 md:h-screen md:w-[232px] md:shrink-0 md:border-r md:border-b-0 md:py-5">
        <div className="flex flex-col gap-2 md:gap-7">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActiveView("overview")}
              aria-label={`${APP_NAME} – Bảng điều khiển`}
              className="inline-flex cursor-pointer items-center gap-2 px-2.5 text-left text-[16px] font-semibold tracking-[-0.01em] whitespace-nowrap text-[var(--text)]"
            >
              <img
                src={appIconUrl}
                alt=""
                width={24}
                height={24}
                className="shrink-0"
              />
              {APP_NAME}
            </button>

            <div className="flex items-center gap-2 px-2.5 text-[12px] text-[var(--muted)] md:hidden">
              <span aria-live="polite">
                {apiState === "online" && !authError ? (
                  <>
                    <span className="text-[var(--green)]" aria-hidden="true">
                      ●
                    </span>{" "}
                    api cục bộ
                  </>
                ) : apiState === "online" && authError ? (
                  <>
                    <span className="text-[var(--warn)]" aria-hidden="true">
                      ▲
                    </span>{" "}
                    thiếu khóa đọc
                  </>
                ) : apiState === "checking" ? (
                  <>
                    <span className="text-[var(--warn)]" aria-hidden="true">
                      ●
                    </span>{" "}
                    đang kiểm tra
                  </>
                ) : (
                  <>
                    <span className="text-[var(--red)]" aria-hidden="true">
                      ✕
                    </span>{" "}
                    ngoại tuyến
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={handleRefresh}
                aria-label="làm mới dữ liệu"
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] border border-transparent text-[var(--muted)] transition-colors hover:border-[var(--bstrong)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
              >
                <RefreshCw
                  className={cn("h-3 w-3", isFetching > 0 && "animate-spin")}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <nav
            aria-label="Menu chính"
            className="hidden flex-col gap-0.5 md:flex"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActiveView(item.id)}
                  className={cn(
                    "tally-nav cursor-pointer gap-2.5 text-left md:w-full",
                    isActive && "is-active",
                  )}
                >
                  <span>{item.label}</span>
                  <span className="tally-kbd" aria-hidden="true">
                    {item.kbd}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden flex-col gap-1.5 px-2.5 text-[12px] text-[var(--muted)] md:flex">
          <div className="flex items-start justify-between gap-2">
            <span aria-live="polite" className="min-w-0 leading-snug">
              {apiState === "online" && !authError ? (
                <>
                  <span className="text-[var(--green)]" aria-hidden="true">
                    ●
                  </span>{" "}
                  api cục bộ đang hoạt động
                </>
              ) : apiState === "online" && authError ? (
                <>
                  <span className="text-[var(--warn)]" aria-hidden="true">
                    ▲
                  </span>{" "}
                  thiếu khóa đọc api
                </>
              ) : apiState === "checking" ? (
                <>
                  <span className="text-[var(--warn)]" aria-hidden="true">
                    ●
                  </span>{" "}
                  đang kiểm tra kết nối
                </>
              ) : (
                <>
                  <span className="text-[var(--red)]" aria-hidden="true">
                    ✕
                  </span>{" "}
                  api cục bộ chưa chạy
                </>
              )}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="làm mới dữ liệu"
              title="làm mới dữ liệu"
              className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[2px] border border-transparent text-[var(--muted)] transition-colors hover:border-[var(--bstrong)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
            >
              <RefreshCw
                className={cn("h-3 w-3", isFetching > 0 && "animate-spin")}
                aria-hidden="true"
              />
            </button>
          </div>
          <div>{canWrite ? "chế độ chủ sở hữu" : "chế độ chỉ đọc"}</div>
          <div>
            vi-VN · {currencyCode === "VND" ? "₫ VND" : currencyCode}
          </div>
        </div>
      </aside>

      <nav className="tally-mobile-nav md:hidden" aria-label="Điều hướng chính">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.mobileLabel}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setActiveView(item.id)}
              className={cn(
                "tally-mobile-nav-item",
                isActive && "is-active",
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 sm:px-7 md:sticky md:top-0 md:gap-3 md:py-4">
          <div className="flex w-full items-center gap-3 md:w-auto md:flex-wrap">
            <h1 className="sr-only whitespace-nowrap text-[15px] font-semibold lowercase tracking-[-0.01em] text-[var(--text)] md:not-sr-only">
              {activeNavLabel}
            </h1>
            <MonthPicker
              month={month}
              onChange={setMonth}
              className="max-md:w-full max-md:justify-between"
            />
          </div>

          <div className="flex w-full min-w-0 items-center gap-1.5 md:w-auto md:flex-wrap md:gap-2">
            <button
              type="button"
              onClick={() => openCommandPalette("")}
              aria-label="tìm kiếm hoặc chạy lệnh (phím tắt ⌘K)"
              className="tally-search min-w-0 flex-1 cursor-pointer text-left transition-colors hover:bg-[var(--panel)] md:w-[200px] md:flex-none 2xl:w-[260px]"
            >
              <span className="text-[var(--muted)] md:hidden" aria-hidden="true">
                <Search className="h-4 w-4" />
              </span>
              <span className="hidden text-[var(--muted)] md:inline" aria-hidden="true">
                /
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--muted)]">
                <span className="lg:hidden">tìm kiếm</span>
                <span className="hidden lg:inline">tìm kiếm hoặc chạy lệnh</span>
              </span>
              <span className="tally-kbd hidden shrink-0 lg:inline-flex" aria-hidden="true">
                ⌘K
              </span>
            </button>

            <button
              type="button"
              onClick={handleToggleTheme}
              className="tally-btn h-10 w-10 shrink-0 px-0 lg:w-auto lg:gap-2 lg:px-3 2xl:gap-2.5 2xl:px-3.5"
              aria-label={
                theme === "dark"
                  ? "chuyển sang giao diện sáng (phím tắt l)"
                  : "chuyển sang giao diện tối (phím tắt l)"
              }
              title={
                theme === "dark"
                  ? "chuyển sang giao diện sáng [l]"
                  : "chuyển sang giao diện tối [l]"
              }
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="hidden lg:inline">
                {theme === "dark" ? "sáng" : "tối"}
              </span>
              <span
                className="tally-kbd hidden 2xl:inline-flex"
                aria-hidden="true"
              >
                l
              </span>
            </button>

            {canWrite ? (
              <>
                <button
                  type="button"
                  onClick={() => setIncomeDialogOpen(true)}
                  aria-label="đặt thu nhập tháng"
                  title="đặt thu nhập tháng"
                  className="tally-btn h-10 w-10 shrink-0 px-0 lg:w-auto lg:gap-2 lg:px-3 2xl:gap-2.5 2xl:px-3.5"
                >
                  <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="hidden lg:inline">thu nhập</span>
                  <span
                    className="tally-kbd hidden 2xl:inline-flex"
                    aria-hidden="true"
                  >
                    m
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => openQuickAdd("expense")}
                  aria-label="thêm khoản chi"
                  title="thêm khoản chi"
                  className="tally-btn tally-btn-primary h-10 w-10 shrink-0 px-0 lg:w-auto lg:gap-2 lg:px-3 2xl:gap-2.5 2xl:px-3.5"
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="hidden lg:inline">thêm khoản chi</span>
                  <span className="tally-kbd hidden 2xl:inline-flex" aria-hidden="true">
                    n
                  </span>
                </button>
              </>
            ) : null}
          </div>
        </header>

        {showStatusBanner ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-[12px] sm:px-7"
          >
            {apiState === "offline" ? (
              <>
                <span className="tally-st-over">
                  ✕{" "}
                  {canWrite
                    ? "chưa kết nối được với dashboard worker cục bộ"
                    : "chưa kết nối được với integration worker cục bộ"}{" "}
                  — chạy{" "}
                  <code className="border border-[var(--bstrong)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--text)]">
                    {canWrite
                      ? "cd backend && npm run dev:dashboard"
                      : "cd backend && npm run dev"}
                  </code>
                </span>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="ml-auto cursor-pointer text-[var(--muted)] underline-offset-4 hover:text-[var(--text)] hover:underline"
                >
                  thử lại →
                </button>
              </>
            ) : authError ? (
              <>
                <span className="tally-st-warn">
                  ▲ khóa đọc api chưa được cấu hình hoặc không hợp lệ — chạy{" "}
                  <code className="border border-[var(--bstrong)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--text)]">
                    cd backend && npm run db:setup:local
                  </code>{" "}
                  (tùy chọn{" "}
                  <code className="border border-[var(--bstrong)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--text)]">
                    npm run db:seed:demo
                  </code>
                  ) để tạo{" "}
                  <code className="border border-[var(--bstrong)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--text)]">
                    dashboard/.env.local
                  </code>
                </span>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="ml-auto cursor-pointer text-[var(--muted)] underline-offset-4 hover:text-[var(--text)] hover:underline"
                >
                  thử lại →
                </button>
              </>
            ) : hasBudgetAlerts ? (
              <>
                {overBannerParts.length > 0 ? (
                  <span className="tally-st-over tally-num">
                    ✕ {overBannerParts.join(" · ")}
                    {extraOverCount > 0 ? ` · +${extraOverCount} mục khác` : ""}
                  </span>
                ) : null}
                {warnBannerParts.length > 0 ? (
                  <span className="tally-st-warn tally-num">
                    ▲ {warnBannerParts.join(" · ")}
                    {extraWarnCount > 0 ? ` · +${extraWarnCount} mục khác` : ""}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setActiveView("budgets")}
                  className="ml-auto cursor-pointer text-[var(--muted)] underline-offset-4 hover:text-[var(--text)] hover:underline"
                >
                  xem ngân sách →
                </button>
              </>
            ) : overIncome && summaryQuery.data ? (
              <>
                <span className="tally-st-over tally-num">
                  ✕ chi tiêu tháng này vượt thu nhập{" "}
                  {formatMoney(
                    Math.abs(summaryQuery.data.remaining_minor),
                    currencyCode,
                  )}
                </span>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => setIncomeDialogOpen(true)}
                    className="ml-auto cursor-pointer text-[var(--muted)] underline-offset-4 hover:text-[var(--text)] hover:underline"
                  >
                    đặt thu nhập →
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <div className="flex-1 px-4 py-7 sm:px-7 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {activeView === "overview" ? (
                <OverviewView
                  month={month}
                  onMonthChange={setMonth}
                  categories={categories}
                  canWrite={canWrite}
                  onOpenQuickAdd={openQuickAdd}
                  onOpenMonthlyIncome={() => setIncomeDialogOpen(true)}
                  onOpenBudgets={() => setActiveView("budgets")}
                  onOpenLedger={openLedger}
                  onSelectTransaction={setSelectedTransactionId}
                  trendTableToggleToken={trendTableToggleToken}
                />
              ) : activeView === "ledger" ? (
                <LedgerView
                  month={month}
                  onMonthChange={setMonth}
                  categoryFilter={categoryFilter}
                  onCategoryFilterChange={setCategoryFilter}
                  typeFilter={typeFilter}
                  onTypeFilterChange={setTypeFilter}
                  searchTerm={searchTerm}
                  onSearchTermChange={setSearchTerm}
                  categories={categories}
                  canWrite={canWrite}
                  onOpenQuickAdd={() => openQuickAdd("expense")}
                  onOpenMonthlyIncome={() => setIncomeDialogOpen(true)}
                  onSelectTransaction={setSelectedTransactionId}
                  onNotify={notify}
                />
              ) : activeView === "budgets" ? (
                <CategoriesView
                  month={month}
                  onMonthChange={setMonth}
                  categories={categories}
                  isLoadingCategories={categoriesQuery.isLoading}
                  canWrite={canWrite}
                  onOpenMonthlyIncome={() => setIncomeDialogOpen(true)}
                  onBrowseCategory={(categoryId: string) =>
                    openLedger({ categoryId })
                  }
                  onNotify={notify}
                />
              ) : activeView === "reports" ? (
                <ReportsView
                  month={month}
                  onMonthChange={setMonth}
                  categories={categories}
                  onBrowseCategory={(categoryId: string) =>
                    openLedger({ categoryId })
                  }
                />
              ) : (
                <SettingsView
                  month={month}
                  currencyCode={currencyCode}
                  canWrite={canWrite}
                  apiState={apiState}
                  authError={Boolean(authError)}
                  onOpenMonthlyIncome={() => setIncomeDialogOpen(true)}
                  onOpenShortcuts={() => setShortcutsOpen(true)}
                  onRefresh={handleRefresh}
                  onNotify={notify}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="tally-num flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--border)] px-4 py-2.5 text-[12px] text-[var(--muted)] sm:px-7">
          <span>
            {formatMonthShort(month)} · ngày {monthElapsed.elapsed}/
            {monthElapsed.total} ·{" "}
            {monthTransactionsQuery.isLoading
              ? "…"
              : `${monthTxCount}${monthTxTruncated ? "+" : ""}`}{" "}
            giao dịch · riêng tư mặc định
          </span>
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            <span className="tally-kbd" aria-hidden="true">
              ?
            </span>
            <span>phím tắt</span>
          </button>
        </footer>
      </main>

      <AnimatePresence>
        {toast ? (
          <TallyToast
            key={toast.id}
            toast={toast}
            onDismiss={() => setToast(null)}
          />
        ) : null}
      </AnimatePresence>

      <TransactionDetailDialog
        transactionId={selectedTransactionId}
        categories={categories}
        canWrite={canWrite}
        onDeleted={(msg) => notify(msg, "success")}
        onClose={() => setSelectedTransactionId(null)}
      />

      <QuickAddTodayDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        defaultType={quickAddDefaultType}
        currencyCode={currencyCode}
        categories={categories}
        recentMerchants={recentMerchants}
        onSuccess={(msg) => notify(msg, "success")}
      />

      <MonthlyIncomeDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        month={month}
        currencyCode={currencyCode}
        categories={categories}
        onSuccess={(msg) => notify(msg, "success")}
      />

      <CommandPaletteDialog
        open={commandOpen}
        onOpenChange={(nextOpen: boolean) => {
          setCommandOpen(nextOpen);
          if (!nextOpen) {
            setCommandInitialQuery("");
          }
        }}
        initialQuery={commandInitialQuery}
        activeView={activeView}
        canWrite={canWrite}
        transactions={monthTransactions}
        categories={categories}
        onNavigate={setActiveView}
        onOpenQuickAdd={openQuickAdd}
        onOpenMonthlyIncome={() => setIncomeDialogOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onSelectTransaction={setSelectedTransactionId}
        onSearchInLedger={(query: string) => {
          setCategoryFilter(undefined);
          setTypeFilter("all");
          setSearchTerm(query);
          setActiveView("ledger");
        }}
      />

      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        canWrite={canWrite}
      />
    </div>
  );
}
