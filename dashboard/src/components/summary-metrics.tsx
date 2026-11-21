import { Pane } from "@/components/ui/pane";
import type { BudgetOverview } from "@/hooks/use-budgets";
import type { SamePeriodComparison } from "@/hooks/use-ledger";
import type { MonthlySummary } from "@/lib/api";
import {
  formatAmountNumber,
  formatMoney,
  formatMonthNameLower,
  formatPercentVi,
  getCurrencyDisplayInfo,
  getCurrentMonth,
  getMonthElapsedDays,
  shiftMonth,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SummaryMetricsProps {
  summary?: MonthlySummary;
  isLoading: boolean;
  variant?: "cards" | "strip";
  canWrite?: boolean;
  onOpenMonthlyIncome?: () => void;
  month?: string;
  txCount?: number;
  budgetOverview?: BudgetOverview;
  comparison?: SamePeriodComparison;
  onOpenBudgets?: () => void;
  isEmptyMonth?: boolean;
}

const UNICODE_MINUS = "\u2212";

function FormattedKpiAmount({
  amountMinor,
  currencyCode,
  signed = false,
  className,
  currencyClassName,
}: {
  amountMinor: number;
  currencyCode: string;
  signed?: boolean;
  className?: string;
  currencyClassName?: string;
}) {
  const { symbol, symbolPosition } = getCurrencyDisplayInfo(currencyCode);
  const absFormatted = formatAmountNumber(amountMinor, currencyCode);
  const sign = signed && amountMinor < 0 ? UNICODE_MINUS : "";

  return (
    <span className={cn("tally-num", className)}>
      {sign}
      {symbolPosition === "prefix" ? (
        <span className={cn("tally-cur mr-0.5", currencyClassName)}>
          {symbol}
        </span>
      ) : null}
      {absFormatted}
      {symbolPosition === "suffix" ? (
        <span className={cn("tally-cur ml-1.5", currencyClassName)}>
          {symbol}
        </span>
      ) : null}
    </span>
  );
}

export function SummaryMetrics({
  summary,
  isLoading,
  variant = "cards",
  canWrite = false,
  onOpenMonthlyIncome,
  month,
  txCount,
  budgetOverview,
  comparison,
  onOpenBudgets,
  isEmptyMonth = false,
}: SummaryMetricsProps) {
  const currency = summary?.currency_code ?? "VND";
  const currencyInfo = getCurrencyDisplayInfo(currency);
  const remaining = summary?.remaining_minor ?? 0;
  const isNegativeRemaining = remaining < 0;

  if (variant === "strip") {
    return (
      <section
        aria-label="Tổng hợp tháng đã chọn"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <Pane title="thu nhập" as="div" className="pt-5 pb-3.5">
          <div className="flex items-baseline justify-between gap-3">
            {isLoading && !summary ? (
              <div className="tally-sk h-6 w-28" />
            ) : (
              <div className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--text)] tally-num">
                {summary ? (
                  <FormattedKpiAmount
                    amountMinor={summary.income_minor}
                    currencyCode={currency}
                    currencyClassName="text-[13px]"
                  />
                ) : (
                  <span className="text-[var(--muted)]">–</span>
                )}
              </div>
            )}
            {canWrite && onOpenMonthlyIncome ? (
              <button
                type="button"
                onClick={onOpenMonthlyIncome}
                className="shrink-0 cursor-pointer text-[12px] text-[var(--accent)] hover:underline"
              >
                đặt thu nhập
              </button>
            ) : null}
          </div>
        </Pane>

        <Pane title="chi tiêu ròng" as="div" className="pt-5 pb-3.5">
          {isLoading && !summary ? (
            <div className="tally-sk h-6 w-28" />
          ) : (
            <div className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--text)] tally-num">
              {summary ? (
                <FormattedKpiAmount
                  amountMinor={summary.net_spending_minor}
                  currencyCode={currency}
                  currencyClassName="text-[13px]"
                />
              ) : (
                <span className="text-[var(--muted)]">–</span>
              )}
            </div>
          )}
        </Pane>

        <Pane title="còn lại sau chi tiêu" as="div" className="pt-5 pb-3.5">
          {isLoading && !summary ? (
            <div className="tally-sk h-6 w-28" />
          ) : (
            <div
              className={cn(
                "text-[18px] font-semibold tracking-[-0.01em] tally-num",
                isNegativeRemaining
                  ? "tally-st-over"
                  : "text-[var(--text)]",
              )}
            >
              {summary ? (
                <FormattedKpiAmount
                  amountMinor={summary.remaining_minor}
                  currencyCode={currency}
                  signed
                  currencyClassName="text-[13px]"
                />
              ) : (
                <span className="text-[var(--muted)]">–</span>
              )}
            </div>
          )}
        </Pane>
      </section>
    );
  }

  const resolvedMonth = month ?? summary?.month ?? getCurrentMonth();
  const prevMonth = shiftMonth(resolvedMonth, -1);
  const elapsedInfo = getMonthElapsedDays(resolvedMonth);
  const netSpendingMinor = summary?.net_spending_minor ?? 0;
  const incomeMinor = summary?.income_minor ?? 0;
  const refundsMinor = summary?.refunds_minor ?? 0;
  const hasBudgets = Boolean(budgetOverview?.hasBudgets);

  // KPI 2: Remaining calculation (budget-backed preferred, else income-backed)
  const budgetRemainingMinor = hasBudgets
    ? (budgetOverview?.totalBudgetMinor ?? 0) - netSpendingMinor
    : 0;
  const budgetUsedRatio =
    hasBudgets && (budgetOverview?.totalBudgetMinor ?? 0) > 0
      ? netSpendingMinor / budgetOverview!.totalBudgetMinor
      : 0;
  const budgetUsedPct = Math.round(budgetUsedRatio * 100);
  const budgetBarWidthPct = Math.min(100, Math.max(0, budgetUsedRatio * 100));
  const paceDiffPoints = budgetUsedPct - elapsedInfo.pct;
  const budgetBarTone: "ok" | "warn" | "over" =
    budgetRemainingMinor < 0
      ? "over"
      : budgetUsedPct >= 80 || (elapsedInfo.isCurrent && paceDiffPoints > 5)
        ? "warn"
        : "ok";

  const incomeUsedRatio =
    incomeMinor > 0 ? Math.max(0, netSpendingMinor) / incomeMinor : 0;
  const incomeUsedPct = Math.round(incomeUsedRatio * 100);
  const incomeBarWidthPct = Math.min(100, Math.max(0, incomeUsedRatio * 100));
  const incomeBarTone: "ok" | "warn" | "over" =
    remaining < 0 ? "over" : incomeUsedPct >= 80 ? "warn" : "ok";

  // KPI 3: Daily average
  const elapsedDivisor = Math.max(1, elapsedInfo.elapsed);
  const dailyAvgMinor = Math.round(netSpendingMinor / elapsedDivisor);
  const budgetDailyMinor = hasBudgets
    ? Math.round((budgetOverview?.totalBudgetMinor ?? 0) / elapsedInfo.total)
    : 0;

  // KPI 4: Same-period comparison
  const hasComparison =
    !isEmptyMonth &&
    Boolean(comparison?.hasPrevData) &&
    comparison?.deltaRatio !== null &&
    comparison?.deltaRatio !== undefined;
  const deltaRatio = comparison?.deltaRatio ?? 0;
  const isDeltaNearZero = Math.abs(deltaRatio) < 0.0005;
  const isDeltaUp = !isDeltaNearZero && deltaRatio > 0;

  return (
    <div
      aria-label="Chỉ số tổng quan tháng"
      className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6"
    >
      {/* KPI 1: Spent */}
      <Pane title={`đã chi · ${formatMonthNameLower(resolvedMonth)}`}>
        {isLoading && !summary ? (
          <div className="space-y-2.5">
            <div className="tally-sk h-[26px] w-36" />
            <div className="tally-sk h-[14px] w-44" />
          </div>
        ) : isEmptyMonth ? (
          <>
            <div className="tally-big tally-num">
              <FormattedKpiAmount amountMinor={0} currencyCode={currency} />
            </div>
            <div className="tally-sub">chưa có giao dịch nào</div>
          </>
        ) : (
          <>
            <div className="tally-big tally-num">
              <FormattedKpiAmount
                amountMinor={netSpendingMinor}
                currencyCode={currency}
                signed
              />
            </div>
            <div className="tally-sub tally-num">
              {txCount !== undefined
                ? `${txCount} giao dịch · ngày ${elapsedInfo.elapsed} trên ${elapsedInfo.total}`
                : `ngày ${elapsedInfo.elapsed} trên ${elapsedInfo.total}`}
              {refundsMinor > 0
                ? ` · hoàn ${formatMoney(refundsMinor, currency)}`
                : ""}
            </div>
          </>
        )}
      </Pane>

      {/* KPI 2: Remaining */}
      <Pane title="còn lại">
        {isLoading && !summary ? (
          <div className="space-y-2.5">
            <div className="tally-sk h-[26px] w-32" />
            <div className="tally-sk h-2 w-full" />
            <div className="tally-sk h-[14px] w-48" />
          </div>
        ) : !isEmptyMonth && hasBudgets && summary ? (
          <>
            <div
              className={cn(
                "tally-big tally-num",
                budgetRemainingMinor < 0 && "tally-st-over",
              )}
            >
              <FormattedKpiAmount
                amountMinor={budgetRemainingMinor}
                currencyCode={currency}
                signed
              />
            </div>
            <div
              className="tally-bar mt-2.5"
              role="img"
              aria-label={`Đã dùng ${budgetUsedPct} phần trăm ngân sách, đã qua ${elapsedInfo.pct} phần trăm của tháng`}
            >
              <div
                className={cn(
                  "tally-bar-fill",
                  budgetBarTone === "over"
                    ? "is-over"
                    : budgetBarTone === "warn"
                      ? "is-warn"
                      : "is-ok",
                )}
                style={{ width: `${budgetBarWidthPct}%` }}
              />
              <i
                className="tally-tick"
                style={{ left: `${Math.min(100, Math.max(0, elapsedInfo.pct))}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="tally-sub tally-num">
              {budgetRemainingMinor < 0 ? (
                <span className="tally-st-over">
                  ✕ vượt ngân sách{" "}
                  {formatMoney(Math.abs(budgetRemainingMinor), currency)}
                </span>
              ) : elapsedInfo.isCurrent ? (
                <>
                  {paceDiffPoints > 0 ? (
                    <span className="tally-st-warn">
                      ▲ nhanh hơn tiến độ {paceDiffPoints} điểm
                    </span>
                  ) : (
                    <span className="text-[var(--green)]">✓ đúng tiến độ</span>
                  )}
                  {elapsedInfo.remainingDays > 0
                    ? ` · ${formatMoney(Math.floor(budgetRemainingMinor / elapsedInfo.remainingDays), currency)}/ngày trong ${elapsedInfo.remainingDays} ngày`
                    : " · ngày cuối tháng"}
                </>
              ) : (
                <span className="text-[var(--green)]">
                  ✓ đã dùng {budgetUsedPct}% ngân sách
                </span>
              )}
            </div>
          </>
        ) : !isEmptyMonth && summary && incomeMinor > 0 ? (
          <>
            <div
              className={cn(
                "tally-big tally-num",
                isNegativeRemaining && "tally-st-over",
              )}
            >
              <FormattedKpiAmount
                amountMinor={remaining}
                currencyCode={currency}
                signed
              />
            </div>
            <div
              className="tally-bar mt-2.5"
              role="img"
              aria-label={`Đã chi ${incomeUsedPct} phần trăm thu nhập, đã qua ${elapsedInfo.pct} phần trăm của tháng`}
            >
              <div
                className={cn(
                  "tally-bar-fill",
                  incomeBarTone === "over"
                    ? "is-over"
                    : incomeBarTone === "warn"
                      ? "is-warn"
                      : "is-ok",
                )}
                style={{ width: `${incomeBarWidthPct}%` }}
              />
              <i
                className="tally-tick"
                style={{ left: `${Math.min(100, Math.max(0, elapsedInfo.pct))}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="tally-sub tally-num">
              {isNegativeRemaining ? (
                <span className="tally-st-over">
                  ✕ vượt thu nhập {formatMoney(Math.abs(remaining), currency)}
                </span>
              ) : (
                <>
                  <span>còn {Math.max(0, 100 - incomeUsedPct)}% thu nhập</span>
                  {elapsedInfo.isCurrent && elapsedInfo.remainingDays > 0
                    ? ` · ${formatMoney(Math.floor(remaining / elapsedInfo.remainingDays), currency)}/ngày trong ${elapsedInfo.remainingDays} ngày`
                    : ""}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="tally-big tally-num">
              –{" "}
              <span className="tally-cur">{currencyInfo.symbol}</span>
            </div>
            <div className="tally-sub flex flex-wrap items-center gap-x-2 gap-y-1">
              {onOpenBudgets ? (
                <button
                  type="button"
                  onClick={onOpenBudgets}
                  className="cursor-pointer text-[var(--accent)] hover:underline"
                >
                  đặt ngân sách
                </button>
              ) : null}
              {onOpenBudgets && canWrite && onOpenMonthlyIncome ? (
                <span aria-hidden="true">·</span>
              ) : null}
              {canWrite && onOpenMonthlyIncome ? (
                <button
                  type="button"
                  onClick={onOpenMonthlyIncome}
                  className="cursor-pointer text-[var(--accent)] hover:underline"
                >
                  đặt thu nhập
                </button>
              ) : null}
              {!onOpenBudgets && !(canWrite && onOpenMonthlyIncome) ? (
                <span>đặt ngân sách để theo dõi mục này</span>
              ) : null}
            </div>
          </>
        )}
      </Pane>

      {/* KPI 3: Average per day */}
      <Pane title="trung bình mỗi ngày">
        {isLoading && !summary ? (
          <div className="space-y-2.5">
            <div className="tally-sk h-[26px] w-32" />
            <div className="tally-sk h-[14px] w-44" />
          </div>
        ) : isEmptyMonth ? (
          <>
            <div className="tally-big tally-num">
              <FormattedKpiAmount amountMinor={0} currencyCode={currency} />
            </div>
            <div className="tally-sub">cần thêm dữ liệu trong tháng</div>
          </>
        ) : (
          <>
            <div className="tally-big tally-num">
              <FormattedKpiAmount
                amountMinor={dailyAvgMinor}
                currencyCode={currency}
                signed
              />
            </div>
            <div className="tally-sub tally-num">
              {hasBudgets
                ? `mức theo ngân sách: ${formatMoney(budgetDailyMinor, currency)}/ngày`
                : incomeMinor > 0
                  ? `thu nhập tháng: ${formatMoney(incomeMinor, currency)}`
                  : "cần thêm dữ liệu trong tháng"}
            </div>
          </>
        )}
      </Pane>

      {/* KPI 4: vs previous month, same period */}
      <Pane title={`so với ${formatMonthNameLower(prevMonth)}, cùng kỳ`}>
        {isLoading && !summary ? (
          <div className="space-y-2.5">
            <div className="tally-sk h-[26px] w-28" />
            <div className="tally-sk h-[14px] w-48" />
          </div>
        ) : hasComparison && comparison ? (
          <>
            <div className="tally-big tally-num">
              {isDeltaNearZero ? (
                <>
                  <span className="text-[var(--muted)]">•</span> 0,0%
                </>
              ) : isDeltaUp ? (
                <>
                  <span className="tally-st-warn">▲</span>{" "}
                  {formatPercentVi(deltaRatio, 1, { showSign: true })}
                </>
              ) : (
                <>
                  <span className="text-[var(--green)]">▼</span>{" "}
                  {formatPercentVi(deltaRatio, 1, { showSign: true })}
                </>
              )}
            </div>
            <div className="tally-sub tally-num">
              {formatAmountNumber(comparison.prevMinor, currency)} →{" "}
              {formatMoney(comparison.currentMinor, currency)} (
              {formatAmountNumber(comparison.deltaMinor, currency, {
                signed: true,
                showPlus: true,
              })}
              )
            </div>
          </>
        ) : (
          <>
            <div className="tally-big tally-num">–</div>
            <div className="tally-sub">
              chưa có dữ liệu tháng trước để so sánh
            </div>
          </>
        )}
      </Pane>
    </div>
  );
}
