import { useMemo } from "react";
import { BudgetProgressPane } from "@/components/budget-progress-pane";
import { CategoryBreakdown } from "@/components/category-breakdown";
import { RecentActivity } from "@/components/recent-activity";
import { SpendingTrendChart } from "@/components/spending-trend-chart";
import { SummaryMetrics } from "@/components/summary-metrics";
import { Pane } from "@/components/ui/pane";
import { computeBudgetOverview, useBudgets } from "@/hooks/use-budgets";
import {
  computeSamePeriodComparison,
  useMonthlySummary,
  useMonthTransactions,
  useMultiMonthSummaries,
} from "@/hooks/use-ledger";
import type { Category, TransactionType } from "@/lib/api";
import {
  formatDateRangeLabel,
  formatMonthShort,
  getCurrentMonth,
  getMonthElapsedDays,
  shiftMonth,
} from "@/lib/format";

export interface OverviewViewProps {
  month: string;
  onMonthChange: (nextMonth: string) => void;
  categories: Category[];
  canWrite: boolean;
  onOpenQuickAdd: (defaultType?: TransactionType) => void;
  onOpenMonthlyIncome: () => void;
  onOpenBudgets?: () => void;
  onOpenLedger: (options?: {
    categoryId?: string;
    type?: "all" | TransactionType;
  }) => void;
  onSelectTransaction: (id: string) => void;
  trendTableToggleToken?: number;
}

const LOADING_BAR_HEIGHTS = [30, 55, 20, 75, 40, 60, 25, 45] as const;

export function OverviewView({
  month,
  onMonthChange,
  categories,
  canWrite,
  onOpenQuickAdd,
  onOpenMonthlyIncome,
  onOpenBudgets,
  onOpenLedger,
  onSelectTransaction,
  trendTableToggleToken,
}: OverviewViewProps) {
  const currentMonth = getCurrentMonth();
  const prevMonth = shiftMonth(month, -1);
  const elapsedInfo = useMemo(() => getMonthElapsedDays(month), [month]);

  const summaryQuery = useMonthlySummary(month);
  const monthTxQuery = useMonthTransactions(month);
  const prevMonthTxQuery = useMonthTransactions(prevMonth);
  const multiMonth = useMultiMonthSummaries(month, 6);
  const { budgets } = useBudgets();

  const activeSummary =
    summaryQuery.data && summaryQuery.data.month === month
      ? summaryQuery.data
      : undefined;

  const transactions = monthTxQuery.data?.items ?? [];
  const prevTransactions = prevMonthTxQuery.data?.items ?? [];
  const currency = activeSummary?.currency_code ?? "VND";

  const budgetOverview = useMemo(
    () => computeBudgetOverview(budgets, activeSummary, categories),
    [budgets, activeSummary, categories],
  );

  const comparison = useMemo(
    () =>
      computeSamePeriodComparison(
        month,
        transactions,
        prevMonth,
        prevTransactions,
        elapsedInfo.elapsed,
      ),
    [month, transactions, prevMonth, prevTransactions, elapsedInfo.elapsed],
  );

  const recentTransactions = useMemo(
    () => transactions.slice(0, 8),
    [transactions],
  );

  const isLoadingMonth =
    (!activeSummary && summaryQuery.isFetching) ||
    (!monthTxQuery.data && monthTxQuery.isFetching);

  const isEmptyMonth =
    !isLoadingMonth &&
    transactions.length === 0 &&
    (!activeSummary ||
      (activeSummary.net_spending_minor === 0 &&
        activeSummary.gross_expenses_minor === 0 &&
        activeSummary.income_minor === 0 &&
        activeSummary.by_category.length === 0));

  if (isLoadingMonth) {
    return (
      <div className="flex flex-col gap-8">
        <Pane
          title="đang tải"
          aria-busy="true"
          className="px-5 pt-7 pb-5"
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="flex flex-col gap-2.5">
                <div className="tally-sk h-[14px] w-1/2" />
                <div className="tally-sk h-[26px] w-4/5" />
                <div className="tally-sk h-[14px] w-3/5" />
              </div>
            ))}
          </div>

          <div className="mt-6 flex h-[120px] items-end gap-2 border-b border-[var(--bstrong)]">
            {LOADING_BAR_HEIGHTS.map((heightPct, idx) => (
              <div
                key={idx}
                className="tally-sk flex-1"
                style={{ height: `${heightPct}%` }}
              />
            ))}
          </div>

          <p
            role="status"
            className="mt-3.5 text-[12px] text-[var(--muted)]"
          >
            đang tải dữ liệu {formatMonthShort(month)}...
            <span className="tally-cursor">█</span>
          </p>
        </Pane>
      </div>
    );
  }

  if (isEmptyMonth) {
    const isCurrentMonth = month === currentMonth;

    return (
      <div className="flex flex-col gap-8">
        <SummaryMetrics
          variant="cards"
          summary={activeSummary}
          isLoading={false}
          month={month}
          txCount={0}
          budgetOverview={budgetOverview}
          comparison={comparison}
          canWrite={canWrite}
          onOpenMonthlyIncome={onOpenMonthlyIncome}
          onOpenBudgets={onOpenBudgets}
          isEmptyMonth
        />

        {isCurrentMonth ? (
          <Pane
            title="bắt đầu nhanh"
            className="max-w-[860px] px-6 pt-8 pb-7 sm:px-7"
          >
            <div className="flex flex-wrap items-start gap-8">
              <pre
                aria-hidden="true"
                className="m-0 font-mono text-[13px] leading-[1.35] text-[var(--muted)]"
              >
                {"> sổ tháng này\n> chưa có giao dịch nào\n> đang chờ"}
                <span className="tally-cursor">█</span>
              </pre>

              <div className="flex flex-[1_1_340px] flex-col gap-1.5">
                <h3 className="m-0 text-[18px] font-semibold tracking-[-0.01em] text-[var(--text)]">
                  tháng mới của bạn bắt đầu từ đây
                </h3>
                <p className="m-0 text-[var(--muted)]">
                  vài bước nhanh và bảng điều khiển sẽ tự động hiển thị đầy đủ.
                </p>

                <ol className="mt-2.5 list-none p-0">
                  {onOpenBudgets ? (
                    <li className="flex flex-wrap items-center gap-3.5 border-b border-dashed border-[var(--border)] py-3.5 last:border-b-0">
                      <span
                        className={
                          budgetOverview.hasBudgets
                            ? "text-[var(--green)]"
                            : "text-[var(--muted)]"
                        }
                      >
                        {budgetOverview.hasBudgets ? "✓" : "○"}
                      </span>
                      <span className="min-w-[180px] flex-1">
                        thiết lập ngân sách tháng
                      </span>
                      <button
                        type="button"
                        onClick={onOpenBudgets}
                        className="tally-btn h-[34px]"
                      >
                        <span>ngân sách</span>
                        <span className="tally-kbd">b</span>
                      </button>
                    </li>
                  ) : null}

                  {canWrite ? (
                    <li className="flex flex-wrap items-center gap-3.5 border-b border-dashed border-[var(--border)] py-3.5 last:border-b-0">
                      <span className="text-[var(--muted)]">○</span>
                      <span className="min-w-[180px] flex-1">
                        đặt thu nhập tháng
                      </span>
                      <button
                        type="button"
                        onClick={onOpenMonthlyIncome}
                        className="tally-btn h-[34px]"
                      >
                        <span>thu nhập</span>
                        <span className="tally-kbd">m</span>
                      </button>
                    </li>
                  ) : null}

                  {canWrite ? (
                    <li className="flex flex-wrap items-center gap-3.5 border-b border-dashed border-[var(--border)] py-3.5 last:border-b-0">
                      <span className="text-[var(--muted)]">○</span>
                      <span className="min-w-[180px] flex-1">
                        thêm khoản chi đầu tiên
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenQuickAdd("expense")}
                        className="tally-btn tally-btn-primary h-[34px]"
                      >
                        <span>+ thêm khoản chi đầu tiên</span>
                        <span className="tally-kbd">n</span>
                      </button>
                    </li>
                  ) : (
                    <li className="flex flex-wrap items-center gap-3.5 py-3.5">
                      <span className="text-[var(--muted)]">○</span>
                      <span className="min-w-[180px] flex-1">
                        xem lịch sử giao dịch các tháng khác
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenLedger()}
                        className="tally-btn h-[34px]"
                      >
                        <span>giao dịch</span>
                        <span className="tally-kbd">t</span>
                      </button>
                    </li>
                  )}
                </ol>
              </div>
            </div>
          </Pane>
        ) : (
          <Pane
            title="không có dữ liệu trong khoảng"
            className="flex max-w-[760px] flex-col gap-4"
          >
            <div className="text-[12px] text-[var(--muted)] tally-num">
              khoảng: {formatDateRangeLabel(month)}
            </div>
            <div className="flex flex-col gap-2.5 border border-dashed border-[var(--bstrong)] bg-[var(--panel)] p-6">
              <p className="m-0 text-[15px] font-semibold text-[var(--text)]">
                <span className="mr-1.5 text-[var(--muted)]">∅</span>
                không có giao dịch trong tháng này
              </p>
              <p className="m-0 text-[var(--muted)]">
                chưa có giao dịch nào được ghi nhận cho {formatMonthShort(month)}
                . tổng số và biểu đồ được giữ trống thay vì hiển thị số 0 giả.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onMonthChange(currentMonth)}
                className="tally-btn tally-btn-primary"
              >
                về tháng hiện tại
              </button>
              <button
                type="button"
                onClick={() => onOpenLedger()}
                className="tally-btn"
              >
                <span>xem tất cả giao dịch</span>
                <span className="tally-kbd">t</span>
              </button>
            </div>
          </Pane>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <SummaryMetrics
        variant="cards"
        summary={activeSummary}
        isLoading={summaryQuery.isLoading && !activeSummary}
        month={month}
        txCount={transactions.length}
        budgetOverview={budgetOverview}
        comparison={comparison}
        canWrite={canWrite}
        onOpenMonthlyIncome={onOpenMonthlyIncome}
        onOpenBudgets={onOpenBudgets}
      />

      <div className="flex flex-wrap gap-8">
        <SpendingTrendChart
          month={month}
          transactions={transactions}
          currencyCode={currency}
          isLoading={monthTxQuery.isLoading && !monthTxQuery.data}
          multiMonthItems={multiMonth.items}
          isLoadingMultiMonth={multiMonth.isLoading}
          externalTableToggleToken={trendTableToggleToken}
        />

        <CategoryBreakdown
          summary={activeSummary}
          categories={categories}
          isLoading={summaryQuery.isLoading && !activeSummary}
          onSelectCategory={(categoryId) =>
            onOpenLedger(categoryId ? { categoryId } : undefined)
          }
        />
      </div>

      <div className="flex flex-wrap gap-8">
        <BudgetProgressPane
          budgetOverview={budgetOverview}
          currencyCode={currency}
          isLoading={summaryQuery.isLoading && !activeSummary}
          onOpenBudgets={onOpenBudgets}
          onSelectCategory={(categoryId) => onOpenLedger({ categoryId })}
        />

        <RecentActivity
          transactions={recentTransactions}
          categories={categories}
          isLoading={monthTxQuery.isLoading && !monthTxQuery.data}
          onSelectTransaction={onSelectTransaction}
          onViewAll={() => onOpenLedger()}
        />
      </div>
    </div>
  );
}
