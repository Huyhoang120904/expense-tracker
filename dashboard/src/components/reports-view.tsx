import { useMemo, useState } from "react";
import { Pane } from "@/components/ui/pane";
import {
  useMonthlySummary,
  useMultiMonthSummaries,
} from "@/hooks/use-ledger";
import type { Category } from "@/lib/api";
import { getCategoryColor } from "@/lib/category-colors";
import {
  formatAmountNumber,
  formatCompactVnd,
  formatMoney,
  formatMonthShort,
  formatPercentVi,
  getCurrencyDisplayInfo,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ReportsViewProps {
  month: string;
  onMonthChange: (nextMonth: string) => void;
  categories: Category[];
  onBrowseCategory: (categoryId: string) => void;
}

function renderSplitMoney(amountMinor: number, currencyCode: string) {
  const { symbol, symbolPosition } = getCurrencyDisplayInfo(currencyCode);
  const formattedNumber = formatAmountNumber(amountMinor, currencyCode, {
    signed: true,
  });

  if (symbolPosition === "prefix") {
    return (
      <>
        <span className="tally-cur">{symbol}</span>
        {formattedNumber}
      </>
    );
  }

  return (
    <>
      {formattedNumber} <span className="tally-cur">{symbol}</span>
    </>
  );
}

function computeNiceAxisMax(rawMax: number): number {
  if (rawMax <= 0) {
    return 1_000_000;
  }
  const rawStep = rawMax / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  let niceNormalized: number;
  if (normalized <= 1) {
    niceNormalized = 1;
  } else if (normalized <= 2) {
    niceNormalized = 2;
  } else if (normalized <= 2.5) {
    niceNormalized = 2.5;
  } else if (normalized <= 5) {
    niceNormalized = 5;
  } else {
    niceNormalized = 10;
  }
  return niceNormalized * magnitude * 4;
}

function formatAxisMonthLabel(month: string): string {
  const yearShort = month.slice(2, 4);
  const monthNum = Number(month.slice(5, 7));
  if (!monthNum || !yearShort) {
    return month;
  }
  return `thg ${monthNum}/${yearShort}`;
}

export function ReportsView({
  month,
  onMonthChange,
  categories,
  onBrowseCategory,
}: ReportsViewProps) {
  const multiMonth = useMultiMonthSummaries(month, 6);
  const summaryQuery = useMonthlySummary(month);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const categoryMap = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories],
  );

  const currency =
    summaryQuery.data?.currency_code ??
    multiMonth.items.find((item) => item.summary)?.summary?.currency_code ??
    "VND";

  const loadedItems = useMemo(
    () => multiMonth.items.filter((item) => item.summary !== undefined),
    [multiMonth.items],
  );

  const aggregates = useMemo(() => {
    let sumIncome = 0;
    let sumSpend = 0;
    let maxBarValue = 0;

    for (const item of loadedItems) {
      const s = item.summary;
      if (!s) {
        continue;
      }
      sumIncome += s.income_minor;
      sumSpend += s.net_spending_minor;
      maxBarValue = Math.max(
        maxBarValue,
        Math.max(0, s.income_minor),
        Math.max(0, s.net_spending_minor),
      );
    }

    const avgSpend =
      loadedItems.length > 0 ? Math.round(sumSpend / loadedItems.length) : 0;
    const savingsRate =
      sumIncome > 0 ? (sumIncome - sumSpend) / sumIncome : null;

    return {
      sumIncome,
      sumSpend,
      avgSpend,
      savingsRate,
      maxBarValue,
    };
  }, [loadedItems]);

  const firstMonth = multiMonth.months[0];
  const lastMonth = multiMonth.months[multiMonth.months.length - 1];

  const axisMax = computeNiceAxisMax(aggregates.maxBarValue);
  const plotLeft = 64;
  const plotRight = 788;
  const plotWidth = plotRight - plotLeft;
  const plotTop = 20;
  const plotBottom = 210;
  const plotHeight = plotBottom - plotTop;
  const slotWidth =
    multiMonth.items.length > 0 ? plotWidth / multiMonth.items.length : 120;
  const barWidth = 26;
  const barGap = 6;

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    value: Math.round(axisMax * ratio),
    y: plotBottom - ratio * plotHeight,
  }));

  const activeInspectionMonth = hoveredMonth ?? month;
  const activeInspectionItem =
    multiMonth.items.find((item) => item.month === activeInspectionMonth) ??
    multiMonth.items[multiMonth.items.length - 1];

  const tableRows = useMemo(
    () => [...multiMonth.items].reverse(),
    [multiMonth.items],
  );

  const rankedCategories = useMemo(() => {
    const rows = summaryQuery.data?.by_category ?? [];
    return [...rows].sort(
      (a, b) => b.net_spending_minor - a.net_spending_minor,
    );
  }, [summaryQuery.data]);

  const positiveCategoryTotal = useMemo(
    () =>
      rankedCategories.reduce(
        (acc, row) => acc + Math.max(0, row.net_spending_minor),
        0,
      ),
    [rankedCategories],
  );

  const hasAnyChartData =
    aggregates.sumIncome > 0 || aggregates.sumSpend > 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Pane title="tổng chi 6 tháng">
          {multiMonth.isLoading && loadedItems.length === 0 ? (
            <div className="space-y-2.5">
              <div className="tally-sk h-[26px] w-44" />
              <div className="tally-sk h-[14px] w-36" />
            </div>
          ) : (
            <>
              <div className="tally-big tally-num">
                {renderSplitMoney(aggregates.sumSpend, currency)}
              </div>
              <div className="tally-sub tally-num">
                {firstMonth && lastMonth
                  ? `${formatMonthShort(firstMonth)} – ${formatMonthShort(lastMonth)}`
                  : "cửa sổ 6 tháng gần nhất"}
              </div>
            </>
          )}
        </Pane>

        <Pane title="trung bình chi/tháng">
          {multiMonth.isLoading && loadedItems.length === 0 ? (
            <div className="space-y-2.5">
              <div className="tally-sk h-[26px] w-44" />
              <div className="tally-sk h-[14px] w-36" />
            </div>
          ) : (
            <>
              <div className="tally-big tally-num">
                {renderSplitMoney(aggregates.avgSpend, currency)}
              </div>
              <div className="tally-sub tally-num">
                trên {loadedItems.length || 6} tháng · tổng thu{" "}
                {formatCompactVnd(aggregates.sumIncome, currency)}
              </div>
            </>
          )}
        </Pane>

        <Pane title="tỷ lệ tiết kiệm 6 tháng">
          {multiMonth.isLoading && loadedItems.length === 0 ? (
            <div className="space-y-2.5">
              <div className="tally-sk h-[26px] w-32" />
              <div className="tally-sk h-[14px] w-44" />
            </div>
          ) : (
            <>
              <div className="tally-big tally-num">
                {aggregates.savingsRate !== null ? (
                  <span
                    className={
                      aggregates.savingsRate < 0
                        ? "tally-st-over"
                        : "text-[var(--green)]"
                    }
                  >
                    {aggregates.savingsRate < 0 ? "✕ " : "✓ "}
                    {formatPercentVi(aggregates.savingsRate, 1)}
                  </span>
                ) : (
                  <span className="text-[var(--muted)]">–</span>
                )}
              </div>
              <div className="tally-sub tally-num">
                {aggregates.savingsRate !== null
                  ? `chênh lệch: ${formatMoney(
                      aggregates.sumIncome - aggregates.sumSpend,
                      currency,
                      { showPlus: true },
                    )}`
                  : "chưa có thu nhập trong 6 tháng này"}
              </div>
            </>
          )}
        </Pane>
      </div>

      <Pane title="thu nhập vs chi tiêu · 6 tháng gần nhất">
        {multiMonth.isLoading && loadedItems.length === 0 ? (
          <div aria-busy="true">
            <div className="flex h-[140px] items-end gap-3 border-b border-[var(--bstrong)] pt-4">
              {[42, 68, 35, 76, 52, 62, 48, 84, 58, 44, 72, 60].map(
                (heightPct, idx) => (
                  <div
                    key={idx}
                    className="tally-sk flex-1"
                    style={{ height: `${heightPct}%` }}
                  />
                ),
              )}
            </div>
            <p className="mt-3 text-[12px] text-[var(--muted)]" role="status">
              đang tải dữ liệu 6 tháng
              <span className="tally-cursor" aria-hidden="true">
                █
              </span>
            </p>
          </div>
        ) : !hasAnyChartData ? (
          <div className="border border-dashed border-[var(--bstrong)] bg-[var(--panel)] px-5 py-6">
            <p className="text-[15px] font-semibold">
              <span className="text-[var(--muted)]" aria-hidden="true">
                ∅{" "}
              </span>
              chưa có dữ liệu thu nhập hoặc chi tiêu trong 6 tháng gần nhất
            </p>
            <p className="mt-1.5 text-[12px] text-[var(--muted)]">
              biểu đồ sẽ hiển thị ngay khi có giao dịch chi tiêu hoặc thu nhập
              trong cửa sổ thời gian này.
            </p>
          </div>
        ) : (
          <div>
            <svg
              viewBox="0 0 800 250"
              className="block h-auto w-full"
              role="img"
              aria-label={`biểu đồ so sánh thu nhập và chi tiêu ròng 6 tháng kết thúc ở ${formatMonthShort(month)}`}
              onMouseLeave={() => setHoveredMonth(null)}
            >
              {gridTicks.map((tick, idx) => (
                <g key={tick.value}>
                  <line
                    x1={plotLeft}
                    y1={tick.y}
                    x2={plotRight}
                    y2={tick.y}
                    stroke={idx === 0 ? "var(--bstrong)" : "var(--border)"}
                    strokeDasharray={idx === 0 ? undefined : "2 4"}
                  />
                  <text
                    x={plotLeft - 8}
                    y={tick.y + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="var(--muted)"
                  >
                    {formatCompactVnd(tick.value, currency)}
                  </text>
                </g>
              ))}

              {multiMonth.items.map((item, idx) => {
                const slotX = plotLeft + idx * slotWidth;
                const centerX = slotX + slotWidth / 2;
                const incomeMinor = Math.max(0, item.summary?.income_minor ?? 0);
                const spendMinor = Math.max(
                  0,
                  item.summary?.net_spending_minor ?? 0,
                );

                const incomeHeight =
                  incomeMinor > 0
                    ? Math.max(2, (incomeMinor / axisMax) * plotHeight)
                    : 0;
                const spendHeight =
                  spendMinor > 0
                    ? Math.max(2, (spendMinor / axisMax) * plotHeight)
                    : 0;

                const incomeX = centerX - barWidth - barGap / 2;
                const spendX = centerX + barGap / 2;
                const isSelected = item.month === month;
                const isHovered = item.month === hoveredMonth;

                return (
                  <g
                    key={item.month}
                    role="button"
                    tabIndex={0}
                    aria-label={`${formatMonthShort(item.month)}: thu nhập ${formatMoney(incomeMinor, currency)}, chi tiêu ròng ${formatMoney(spendMinor, currency)}. nhấn để chọn tháng này`}
                    onClick={() => onMonthChange(item.month)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onMonthChange(item.month);
                      }
                    }}
                    onMouseEnter={() => setHoveredMonth(item.month)}
                    onFocus={() => setHoveredMonth(item.month)}
                    onBlur={() => setHoveredMonth(null)}
                    className="cursor-pointer outline-none"
                  >
                    <rect
                      x={slotX + 6}
                      y={plotTop - 4}
                      width={slotWidth - 12}
                      height={plotHeight + 40}
                      fill={
                        isSelected || isHovered ? "var(--panel)" : "transparent"
                      }
                      stroke={isSelected ? "var(--border)" : "none"}
                      strokeDasharray={isSelected ? "2 2" : undefined}
                    />

                    {incomeHeight > 0 ? (
                      <rect
                        x={incomeX}
                        y={plotBottom - incomeHeight}
                        width={barWidth}
                        height={incomeHeight}
                        fill="var(--green)"
                        stroke={isSelected ? "var(--text)" : "none"}
                        strokeWidth={isSelected ? 1.5 : 0}
                      />
                    ) : (
                      <line
                        x1={incomeX}
                        y1={plotBottom}
                        x2={incomeX + barWidth}
                        y2={plotBottom}
                        stroke="var(--bstrong)"
                      />
                    )}

                    {spendHeight > 0 ? (
                      <rect
                        x={spendX}
                        y={plotBottom - spendHeight}
                        width={barWidth}
                        height={spendHeight}
                        fill="var(--blue)"
                        stroke={isSelected ? "var(--text)" : "none"}
                        strokeWidth={isSelected ? 1.5 : 0}
                      />
                    ) : (
                      <line
                        x1={spendX}
                        y1={plotBottom}
                        x2={spendX + barWidth}
                        y2={plotBottom}
                        stroke="var(--bstrong)"
                      />
                    )}

                    <text
                      x={centerX}
                      y={232}
                      textAnchor="middle"
                      fontSize={11}
                      fill={isSelected ? "var(--text)" : "var(--muted)"}
                      fontWeight={isSelected ? 600 : 400}
                    >
                      {formatAxisMonthLabel(item.month)}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-[var(--border)] pt-2.5 text-[12px] text-[var(--muted)]">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="tally-sw"
                    style={{ backgroundColor: "var(--green)" }}
                    aria-hidden="true"
                  />
                  thu nhập
                </span>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="tally-sw"
                    style={{ backgroundColor: "var(--blue)" }}
                    aria-hidden="true"
                  />
                  chi tiêu ròng
                </span>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="tally-sw border border-[var(--text)]"
                    aria-hidden="true"
                  />
                  tháng đang chọn (bấm cột để chuyển)
                </span>
              </div>

              {activeInspectionItem?.summary ? (
                <div className="tally-num text-[var(--text)]">
                  <span className="text-[var(--muted)]">
                    {formatMonthShort(activeInspectionItem.month)}:
                  </span>{" "}
                  thu{" "}
                  <span className="text-[var(--green)]">
                    {formatMoney(
                      activeInspectionItem.summary.income_minor,
                      currency,
                    )}
                  </span>{" "}
                  · chi{" "}
                  <span>
                    {formatMoney(
                      activeInspectionItem.summary.net_spending_minor,
                      currency,
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Pane>

      <Pane title="bảng tổng hợp theo tháng">
        <div
          aria-hidden="true"
          className="tally-row hidden min-h-[32px] grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px] items-center gap-3 border-l-2 border-l-transparent px-3 text-[12px] text-[var(--muted)] sm:grid"
        >
          <span>tháng</span>
          <span className="text-right">thu nhập</span>
          <span className="text-right">chi tiêu ròng</span>
          <span className="text-right">còn lại</span>
          <span className="text-right">tỷ lệ giữ lại</span>
        </div>

        <ul>
          {tableRows.map((item) => {
            const s = item.summary;
            const isSelected = item.month === month;
            const retentionRatio =
              s && s.income_minor > 0
                ? s.remaining_minor / s.income_minor
                : null;

            return (
              <li key={item.month} className="tally-row">
                <button
                  type="button"
                  onClick={() => onMonthChange(item.month)}
                  aria-current={isSelected ? "true" : undefined}
                  className={cn(
                    "grid w-full grid-cols-1 gap-1.5 border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--panel)] sm:grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px] sm:items-center sm:gap-3 cursor-pointer",
                    isSelected
                      ? "border-l-[var(--accent)] bg-[var(--panel)]"
                      : "border-l-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "tally-num text-[13px]",
                      isSelected
                        ? "font-semibold text-[var(--text)]"
                        : "text-[var(--muted)]",
                    )}
                  >
                    {formatMonthShort(item.month)}
                  </span>

                  {item.isLoading && !s ? (
                    <div className="tally-sk h-[14px] w-full sm:col-span-4" />
                  ) : s ? (
                    <>
                      <div className="tally-num flex items-center justify-between text-[13px] sm:block sm:text-right">
                        <span className="text-[11px] text-[var(--muted)] sm:hidden">
                          thu nhập
                        </span>
                        <span
                          className={
                            s.income_minor > 0
                              ? "text-[var(--green)]"
                              : "text-[var(--muted)]"
                          }
                        >
                          {formatMoney(s.income_minor, s.currency_code)}
                        </span>
                      </div>

                      <div className="tally-num flex items-center justify-between text-[13px] sm:block sm:text-right">
                        <span className="text-[11px] text-[var(--muted)] sm:hidden">
                          chi tiêu ròng
                        </span>
                        <span className="text-[var(--text)]">
                          {formatMoney(s.net_spending_minor, s.currency_code)}
                        </span>
                      </div>

                      <div className="tally-num flex items-center justify-between text-[13px] sm:block sm:text-right">
                        <span className="text-[11px] text-[var(--muted)] sm:hidden">
                          còn lại
                        </span>
                        <span
                          className={
                            s.remaining_minor < 0
                              ? "tally-st-over"
                              : s.remaining_minor > 0
                                ? "text-[var(--green)]"
                                : "text-[var(--muted)]"
                          }
                        >
                          {formatMoney(s.remaining_minor, s.currency_code, {
                            showPlus: s.remaining_minor > 0,
                          })}
                        </span>
                      </div>

                      <div className="tally-num flex items-center justify-between text-[12px] sm:block sm:text-right">
                        <span className="text-[11px] text-[var(--muted)] sm:hidden">
                          tỷ lệ giữ lại
                        </span>
                        {retentionRatio !== null ? (
                          <span
                            className={
                              retentionRatio < 0
                                ? "tally-st-over"
                                : "text-[var(--text)]"
                            }
                          >
                            {formatPercentVi(retentionRatio, 1)}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">–</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="text-[12px] text-[var(--muted)] sm:col-span-4 sm:text-right">
                      không có dữ liệu
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Pane>

      <Pane title="top danh mục tháng đang chọn">
        {summaryQuery.isLoading && !summaryQuery.data ? (
          <div aria-busy="true">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="tally-row flex items-center justify-between gap-4 py-3"
              >
                <div className="tally-sk h-[14px] w-44" />
                <div className="tally-sk h-[14px] w-28" />
              </div>
            ))}
            <p className="mt-3 text-[12px] text-[var(--muted)]" role="status">
              đang tải cơ cấu danh mục
              <span className="tally-cursor" aria-hidden="true">
                █
              </span>
            </p>
          </div>
        ) : rankedCategories.length === 0 ? (
          <div className="border border-dashed border-[var(--bstrong)] bg-[var(--panel)] px-5 py-6">
            <p className="text-[15px] font-semibold">
              <span className="text-[var(--muted)]" aria-hidden="true">
                ∅{" "}
              </span>
              chưa có chi tiêu theo danh mục trong {formatMonthShort(month)}
            </p>
            <p className="mt-1.5 text-[12px] text-[var(--muted)]">
              chọn một tháng khác trong bảng phía trên để xem phân bổ chi tiêu.
            </p>
          </div>
        ) : (
          <div>
            <div
              aria-hidden="true"
              className="tally-row hidden min-h-[32px] grid-cols-[minmax(0,1.4fr)_124px_116px_130px_76px] items-center gap-3 px-2 text-[12px] text-[var(--muted)] md:grid"
            >
              <span>danh mục</span>
              <span className="text-right">chi gộp</span>
              <span className="text-right">hoàn tiền</span>
              <span className="text-right">chi ròng</span>
              <span className="text-right">tỷ trọng</span>
            </div>

            <ul>
              {rankedCategories.map((row, idx) => {
                const cat =
                  row.category_id !== null
                    ? categoryMap.get(row.category_id)
                    : undefined;
                const label =
                  row.category_id !== null
                    ? (cat?.name ?? row.category_id).toLowerCase()
                    : "— chưa phân loại";
                const shareRatio =
                  positiveCategoryTotal > 0 && row.net_spending_minor > 0
                    ? row.net_spending_minor / positiveCategoryTotal
                    : 0;
                const swatchColor = getCategoryColor(
                  row.category_id,
                  cat?.name,
                );

                const content = (
                  <>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="tally-num w-5 shrink-0 text-[11px] text-[var(--muted)]">
                        {idx + 1}.
                      </span>
                      {row.category_id !== null ? (
                        <span
                          className="tally-sw"
                          style={{ backgroundColor: swatchColor }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span
                        className={cn(
                          "truncate text-[13px]",
                          row.category_id !== null
                            ? "text-[var(--text)]"
                            : "text-[var(--muted)]",
                        )}
                      >
                        {label}
                      </span>
                      {cat?.archived ? (
                        <span className="tally-tag shrink-0">lưu trữ</span>
                      ) : null}
                    </div>

                    <div className="tally-num flex items-center justify-between text-[12px] text-[var(--muted)] md:block md:text-right">
                      <span className="md:hidden">chi gộp</span>
                      <span>
                        {formatMoney(row.gross_expenses_minor, currency)}
                      </span>
                    </div>

                    <div className="tally-num flex items-center justify-between text-[12px] md:block md:text-right">
                      <span className="text-[var(--muted)] md:hidden">
                        hoàn tiền
                      </span>
                      {row.refunds_minor > 0 ? (
                        <span className="text-[var(--green)]">
                          +{formatMoney(row.refunds_minor, currency)}
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">–</span>
                      )}
                    </div>

                    <div className="tally-num flex items-center justify-between text-[13px] md:block md:text-right">
                      <span className="text-[12px] text-[var(--muted)] md:hidden">
                        chi ròng
                      </span>
                      <span className="text-[var(--text)]">
                        {formatMoney(row.net_spending_minor, currency)}
                      </span>
                    </div>

                    <div className="tally-num flex items-center justify-between text-[12px] text-[var(--muted)] md:block md:text-right">
                      <span className="md:hidden">tỷ trọng</span>
                      <span className="text-[var(--text)]">
                        {formatPercentVi(shareRatio, 1)}
                      </span>
                    </div>
                  </>
                );

                return (
                  <li
                    key={row.category_id ?? "__uncategorized__"}
                    className="tally-row"
                  >
                    {row.category_id !== null ? (
                      <button
                        type="button"
                        onClick={() => onBrowseCategory(row.category_id!)}
                        className="grid w-full grid-cols-1 gap-1.5 px-2 py-2.5 text-left transition-colors hover:bg-[var(--panel)] md:grid-cols-[minmax(0,1.4fr)_124px_116px_130px_76px] md:items-center md:gap-3 cursor-pointer"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="grid w-full grid-cols-1 gap-1.5 px-2 py-2.5 text-left md:grid-cols-[minmax(0,1.4fr)_124px_116px_130px_76px] md:items-center md:gap-3">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="tally-num mt-2 flex items-center justify-between border-t border-[var(--border)] px-2 pt-2.5 text-[12px] text-[var(--muted)]">
              <span>tổng chi ròng · {formatMonthShort(month)}</span>
              <span className="text-[var(--text)]">
                {formatMoney(
                  summaryQuery.data?.net_spending_minor ??
                    positiveCategoryTotal,
                  currency,
                )}
              </span>
            </div>
          </div>
        )}
      </Pane>
    </div>
  );
}
