import { useEffect, useMemo, useRef, useState } from "react";
import { Pane } from "@/components/ui/pane";
import type { MultiMonthSummaryItem } from "@/hooks/use-ledger";
import type { Transaction } from "@/lib/api";
import {
  formatCompactVnd,
  formatMoney,
  formatMonthShort,
  formatPercentVi,
  getMonthElapsedDays,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export type TrendMode = "day" | "week" | "month";

export interface SpendingTrendChartProps {
  month: string;
  transactions: Transaction[];
  currencyCode: string;
  isLoading: boolean;
  multiMonthItems: MultiMonthSummaryItem[];
  isLoadingMultiMonth: boolean;
  externalTableToggleToken?: number;
}

interface ChartBucket {
  key: string;
  shortLabel: string;
  fullLabel: string;
  amountMinor: number;
  txCount?: number;
  dayNumber?: number;
  isHighlighted?: boolean;
  highlightBadge?: string;
}

const SVG_WIDTH = 800;
const SVG_HEIGHT = 262;
const PLOT_LEFT = 56;
const PLOT_RIGHT = 792;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const PLOT_TOP = 20;
const PLOT_BOTTOM = 220;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;
const SKELETON_HEIGHTS = [30, 55, 20, 75, 40, 60, 25, 45] as const;
const NICE_STEP_FACTORS = [
  1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7.5, 8, 10,
] as const;

function computeNiceMax(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) {
    return 400_000;
  }
  const rawStep = rawMax / 4;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;
  const factor =
    NICE_STEP_FACTORS.find((candidate) => candidate >= normalized - 1e-9) ?? 10;
  return factor * magnitude * 4;
}

function formatMonthAxisTick(month: string, referenceYear: number): string {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  if (!year || !monthNum) {
    return month;
  }
  if (year !== referenceYear) {
    return `${monthNum}/${String(year).slice(-2)}`;
  }
  return `thg ${monthNum}`;
}

export function SpendingTrendChart({
  month,
  transactions,
  currencyCode,
  isLoading,
  multiMonthItems,
  isLoadingMultiMonth,
  externalTableToggleToken,
}: SpendingTrendChartProps) {
  const [mode, setMode] = useState<TrendMode>("day");
  const [showTable, setShowTable] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const prevToggleTokenRef = useRef(externalTableToggleToken);

  useEffect(() => {
    if (
      externalTableToggleToken !== undefined &&
      externalTableToggleToken !== prevToggleTokenRef.current
    ) {
      prevToggleTokenRef.current = externalTableToggleToken;
      setShowTable((prev) => !prev);
    }
  }, [externalTableToggleToken]);

  useEffect(() => {
    setActiveIndex(null);
  }, [mode, month]);

  const elapsedInfo = useMemo(() => getMonthElapsedDays(month), [month]);
  const yearNum = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  const mm = String(monthNum).padStart(2, "0");

  const dailyBuckets = useMemo<ChartBucket[]>(() => {
    const dayCount = elapsedInfo.isCurrent
      ? Math.max(1, elapsedInfo.elapsed)
      : elapsedInfo.total;
    const rawTotals = new Array<number>(dayCount).fill(0);
    const txCounts = new Array<number>(dayCount).fill(0);
    const prefix = `${month}-`;

    for (const tx of transactions) {
      if (tx.type !== "expense" && tx.type !== "refund") {
        continue;
      }
      if (!tx.transaction_date.startsWith(prefix)) {
        continue;
      }
      const day = Number(tx.transaction_date.slice(8, 10));
      if (!Number.isInteger(day) || day < 1 || day > dayCount) {
        continue;
      }
      const idx = day - 1;
      txCounts[idx] = (txCounts[idx] ?? 0) + 1;
      rawTotals[idx] =
        (rawTotals[idx] ?? 0) +
        (tx.type === "expense" ? tx.amount_minor : -tx.amount_minor);
    }

    return rawTotals.map((raw, idx) => {
      const day = idx + 1;
      const dd = String(day).padStart(2, "0");
      const isToday = elapsedInfo.isCurrent && day === elapsedInfo.elapsed;
      return {
        key: `${month}-${dd}`,
        shortLabel: String(day),
        fullLabel: `${dd}/${mm}/${yearNum}`,
        amountMinor: Math.max(0, raw),
        txCount: txCounts[idx] ?? 0,
        dayNumber: day,
        isHighlighted: isToday,
        highlightBadge: isToday ? "hôm nay" : undefined,
      };
    });
  }, [elapsedInfo, mm, month, transactions, yearNum]);

  const weeklyBuckets = useMemo<ChartBucket[]>(() => {
    const totalDays = elapsedInfo.total;
    const definitions: Array<{ week: number; start: number; end: number }> = [
      { week: 1, start: 1, end: Math.min(7, totalDays) },
      { week: 2, start: 8, end: Math.min(14, totalDays) },
      { week: 3, start: 15, end: Math.min(21, totalDays) },
      { week: 4, start: 22, end: Math.min(28, totalDays) },
    ];
    if (totalDays > 28) {
      definitions.push({ week: 5, start: 29, end: totalDays });
    }

    const rawTotals = new Array<number>(definitions.length).fill(0);
    const txCounts = new Array<number>(definitions.length).fill(0);
    const prefix = `${month}-`;

    for (const tx of transactions) {
      if (tx.type !== "expense" && tx.type !== "refund") {
        continue;
      }
      if (!tx.transaction_date.startsWith(prefix)) {
        continue;
      }
      const day = Number(tx.transaction_date.slice(8, 10));
      if (!Number.isInteger(day) || day < 1 || day > totalDays) {
        continue;
      }
      const bucketIdx = Math.min(
        definitions.length - 1,
        Math.floor((day - 1) / 7),
      );
      txCounts[bucketIdx] = (txCounts[bucketIdx] ?? 0) + 1;
      rawTotals[bucketIdx] =
        (rawTotals[bucketIdx] ?? 0) +
        (tx.type === "expense" ? tx.amount_minor : -tx.amount_minor);
    }

    return definitions.map((def, idx) => {
      const startDd = String(def.start).padStart(2, "0");
      const endDd = String(def.end).padStart(2, "0");
      const isCurrentWeek =
        elapsedInfo.isCurrent &&
        elapsedInfo.elapsed >= def.start &&
        elapsedInfo.elapsed <= def.end;
      return {
        key: `${month}-w${def.week}`,
        shortLabel: `tuần ${def.week}`,
        fullLabel: `tuần ${def.week} (${startDd}/${mm}–${endDd}/${mm})`,
        amountMinor: Math.max(0, rawTotals[idx] ?? 0),
        txCount: txCounts[idx] ?? 0,
        isHighlighted: isCurrentWeek,
        highlightBadge: isCurrentWeek ? "tuần này" : undefined,
      };
    });
  }, [elapsedInfo, mm, month, transactions]);

  const monthlyBuckets = useMemo<ChartBucket[]>(() => {
    return multiMonthItems.map((item) => {
      const isSelected = item.month === month;
      return {
        key: item.month,
        shortLabel: formatMonthAxisTick(item.month, yearNum),
        fullLabel: formatMonthShort(item.month),
        amountMinor: Math.max(0, item.summary?.net_spending_minor ?? 0),
        isHighlighted: isSelected,
        highlightBadge: isSelected ? "đang chọn" : undefined,
      };
    });
  }, [month, multiMonthItems, yearNum]);

  const activeBuckets =
    mode === "day"
      ? dailyBuckets
      : mode === "week"
        ? weeklyBuckets
        : monthlyBuckets;

  const chartMath = useMemo(() => {
    const count = activeBuckets.length;
    const totalAmount = activeBuckets.reduce(
      (sum, bucket) => sum + bucket.amountMinor,
      0,
    );

    let maxVal = 0;
    let maxIdx = -1;
    let secondVal = 0;

    for (let i = 0; i < count; i += 1) {
      const amount = activeBuckets[i]?.amountMinor ?? 0;
      if (amount > maxVal) {
        secondVal = maxVal;
        maxVal = amount;
        maxIdx = i;
      } else if (amount > secondVal) {
        secondVal = amount;
      }
    }

    const hasOutlier =
      mode === "day" &&
      maxIdx >= 0 &&
      secondVal > 0 &&
      maxVal > secondVal * 2.2;
    const outlierIdx = hasOutlier ? maxIdx : -1;

    const rawScaleTarget = hasOutlier ? secondVal * 1.2 : maxVal;
    const yMax =
      totalAmount > 0 ? computeNiceMax(rawScaleTarget) : computeNiceMax(0);

    const slotWidth = count > 0 ? PLOT_WIDTH / count : PLOT_WIDTH;
    const barWidth =
      mode === "day"
        ? Math.min(24, Math.max(8, slotWidth * 0.62))
        : mode === "week"
          ? Math.min(64, Math.max(24, slotWidth * 0.42))
          : Math.min(56, Math.max(24, slotWidth * 0.44));

    const bars = activeBuckets.map((bucket, idx) => {
      const slotLeft = PLOT_LEFT + idx * slotWidth;
      const centerX = slotLeft + slotWidth / 2;
      const x = centerX - barWidth / 2;
      const isOutlier = idx === outlierIdx;

      let height = 0;
      let y = PLOT_BOTTOM;
      if (totalAmount > 0 && bucket.amountMinor > 0) {
        if (isOutlier) {
          height = PLOT_HEIGHT;
          y = PLOT_TOP;
        } else {
          height = Math.max(
            2,
            Math.min(PLOT_HEIGHT, (bucket.amountMinor / yMax) * PLOT_HEIGHT),
          );
          y = PLOT_BOTTOM - height;
        }
      }

      return {
        bucket,
        idx,
        slotLeft,
        slotWidth,
        centerX,
        x,
        y,
        width: barWidth,
        height,
        isOutlier,
      };
    });

    const maPoints: Array<{ idx: number; x: number; y: number; value: number }> =
      [];
    if (mode === "day" && totalAmount > 0 && bars.length >= 2) {
      const startIdx =
        bars.length >= 8 && outlierIdx === 0
          ? 7
          : bars.length >= 7
            ? 6
            : 0;
      for (let i = startIdx; i < bars.length; i += 1) {
        const winStart = Math.max(0, i - 6);
        let sum = 0;
        let samples = 0;
        for (let j = winStart; j <= i; j += 1) {
          if (j === outlierIdx) {
            continue;
          }
          sum += activeBuckets[j]?.amountMinor ?? 0;
          samples += 1;
        }
        if (samples === 0) {
          continue;
        }
        const avg = sum / samples;
        const clampedY = Math.max(
          PLOT_TOP,
          Math.min(PLOT_BOTTOM, PLOT_BOTTOM - (avg / yMax) * PLOT_HEIGHT),
        );
        maPoints.push({
          idx: i,
          x: bars[i]!.centerX,
          y: clampedY,
          value: Math.round(avg),
        });
      }
    }

    const maPath =
      maPoints.length >= 2
        ? maPoints
            .map(
              (pt, index) =>
                `${index === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`,
            )
            .join(" ")
        : "";

    const maByIndex = new Map<number, number>(
      maPoints.map((pt) => [pt.idx, pt.value]),
    );

    return {
      totalAmount,
      yMax,
      bars,
      outlierIdx,
      maPath,
      maByIndex,
    };
  }, [activeBuckets, mode]);

  const isChartLoading =
    mode === "month" ? isLoadingMultiMonth : isLoading;

  const outlierBar =
    chartMath.outlierIdx >= 0 ? chartMath.bars[chartMath.outlierIdx] : undefined;

  const activeBar =
    activeIndex !== null && activeIndex >= 0 && activeIndex < chartMath.bars.length
      ? chartMath.bars[activeIndex]
      : undefined;

  const svgAriaLabel = useMemo(() => {
    if (chartMath.totalAmount === 0) {
      return `Biểu đồ xu hướng chi tiêu ${formatMonthShort(month)}: chưa có chi tiêu nào.`;
    }
    if (mode === "day") {
      const base = `Chi tiêu theo ngày trong ${formatMonthShort(month)}, tổng ${formatMoney(chartMath.totalAmount, currencyCode)}.`;
      if (outlierBar) {
        return `${base} Ngày ${outlierBar.bucket.dayNumber}/${monthNum} cao đột biến ${formatMoney(outlierBar.bucket.amountMinor, currencyCode)}.`;
      }
      return base;
    }
    if (mode === "week") {
      return `Chi tiêu theo tuần trong ${formatMonthShort(month)}, tổng ${formatMoney(chartMath.totalAmount, currencyCode)}.`;
    }
    return `Chi tiêu 6 tháng gần nhất kết thúc ở ${formatMonthShort(month)}, tổng ${formatMoney(chartMath.totalAmount, currencyCode)}.`;
  }, [chartMath.totalAmount, currencyCode, mode, month, monthNum, outlierBar]);

  const tableTxTotal = useMemo(
    () =>
      activeBuckets.reduce((sum, bucket) => sum + (bucket.txCount ?? 0), 0),
    [activeBuckets],
  );

  const legendBarLabel =
    mode === "day"
      ? "chi tiêu theo ngày"
      : mode === "week"
        ? "chi tiêu theo tuần"
        : "chi tiêu theo tháng";

  return (
    <Pane
      title="xu hướng chi tiêu"
      className="flex flex-[2_1_520px] flex-col"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div
          className="tally-seg"
          role="group"
          aria-label="Đơn vị thời gian của biểu đồ"
        >
          <button
            type="button"
            className="tally-seg-btn"
            aria-pressed={mode === "day"}
            onClick={() => setMode("day")}
          >
            ngày
          </button>
          <button
            type="button"
            className="tally-seg-btn"
            aria-pressed={mode === "week"}
            onClick={() => setMode("week")}
          >
            tuần
          </button>
          <button
            type="button"
            className="tally-seg-btn"
            aria-pressed={mode === "month"}
            onClick={() => setMode("month")}
          >
            tháng
          </button>
        </div>

        <button
          type="button"
          className="tally-btn h-[32px] text-[12px]"
          aria-pressed={showTable}
          onClick={() => setShowTable((prev) => !prev)}
        >
          <span>{showTable ? "xem biểu đồ" : "xem dạng bảng"}</span>
          <span className="tally-kbd">v</span>
        </button>
      </div>

      {isChartLoading ? (
        <div aria-busy="true" className="pt-2">
          <div className="flex h-[120px] items-end gap-2 border-b border-[var(--bstrong)]">
            {SKELETON_HEIGHTS.map((heightPct, idx) => (
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
            đang tải dữ liệu biểu đồ
            <span className="tally-cursor">█</span>
          </p>
        </div>
      ) : showTable ? (
        <div className="flex flex-1 flex-col">
          <div className="max-h-[290px] overflow-y-auto">
            <table className="w-full border-collapse text-[12px] tally-num">
              <thead>
                <tr className="tally-row text-[var(--muted)]">
                  <th className="py-2 pr-3 text-left font-normal">
                    {mode === "day"
                      ? "ngày"
                      : mode === "week"
                        ? "tuần"
                        : "tháng"}
                  </th>
                  {mode !== "month" ? (
                    <th className="px-3 py-2 text-right font-normal">
                      giao dịch
                    </th>
                  ) : null}
                  <th className="px-3 py-2 text-right font-normal">chi tiêu</th>
                  <th className="py-2 pl-3 text-right font-normal">tỷ trọng</th>
                </tr>
              </thead>
              <tbody>
                {activeBuckets.map((bucket, idx) => {
                  const share =
                    chartMath.totalAmount > 0
                      ? bucket.amountMinor / chartMath.totalAmount
                      : 0;
                  const isOutlier = idx === chartMath.outlierIdx;
                  return (
                    <tr
                      key={bucket.key}
                      className="tally-row transition-colors hover:bg-[var(--panel)]"
                    >
                      <td className="py-2 pr-3 text-left text-[var(--text)]">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span>{bucket.fullLabel}</span>
                          {bucket.highlightBadge ? (
                            <span className="tally-tag">
                              {bucket.highlightBadge}
                            </span>
                          ) : null}
                          {isOutlier ? (
                            <span className="tally-tag">đột biến</span>
                          ) : null}
                        </span>
                      </td>
                      {mode !== "month" ? (
                        <td className="px-3 py-2 text-right text-[var(--muted)]">
                          {bucket.txCount ?? 0}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-right text-[var(--text)]">
                        {formatMoney(bucket.amountMinor, currencyCode)}
                      </td>
                      <td className="py-2 pl-3 text-right text-[var(--muted)]">
                        {formatPercentVi(share, 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[12px] text-[var(--muted)] tally-num">
            <span>
              tổng
              {mode !== "month" ? ` · ${tableTxTotal} giao dịch` : ""}
            </span>
            <span>{formatMoney(chartMath.totalAmount, currencyCode)}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div
            className="relative"
            onMouseLeave={() => setActiveIndex(null)}
          >
            {activeBar ? (
              <div
                role="status"
                className={cn(
                  "pointer-events-none absolute top-0 z-10 border border-[var(--bstrong)] bg-[var(--panel)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--text)] tally-num",
                )}
                style={{
                  left: `${Math.min(76, Math.max(24, (activeBar.centerX / SVG_WIDTH) * 100))}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-[var(--muted)]">
                    {activeBar.bucket.fullLabel}
                  </span>
                  {activeBar.bucket.highlightBadge ? (
                    <span className="text-[var(--accent)]">
                      ({activeBar.bucket.highlightBadge})
                    </span>
                  ) : null}
                  {activeBar.isOutlier ? (
                    <span className="text-[var(--warn)]">cao đột biến</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 whitespace-nowrap">
                  <span className="font-semibold">
                    {formatMoney(activeBar.bucket.amountMinor, currencyCode)}
                  </span>
                  {mode !== "month" ? (
                    <span className="text-[var(--muted)]">
                      · {activeBar.bucket.txCount ?? 0} giao dịch
                    </span>
                  ) : null}
                  {chartMath.maByIndex.has(activeBar.idx) ? (
                    <span className="text-[var(--accent)]">
                      · tb 7n:{" "}
                      {formatCompactVnd(
                        chartMath.maByIndex.get(activeBar.idx) ?? 0,
                        currencyCode,
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="block h-auto w-full"
              role="img"
              aria-label={svgAriaLabel}
            >
              {/* Baseline & 4 dashed gridlines */}
              <line
                x1={PLOT_LEFT}
                y1={PLOT_BOTTOM}
                x2={PLOT_RIGHT}
                y2={PLOT_BOTTOM}
                stroke="var(--bstrong)"
              />
              {GRID_RATIOS.slice(1).map((ratio) => {
                const y = PLOT_BOTTOM - ratio * PLOT_HEIGHT;
                return (
                  <line
                    key={ratio}
                    x1={PLOT_LEFT}
                    y1={y}
                    x2={PLOT_RIGHT}
                    y2={y}
                    stroke="var(--border)"
                    strokeDasharray="2 4"
                  />
                );
              })}

              {/* Y-axis ticks */}
              {GRID_RATIOS.map((ratio) => {
                const y = PLOT_BOTTOM - ratio * PLOT_HEIGHT;
                const tickValue = chartMath.yMax * ratio;
                return (
                  <text
                    key={ratio}
                    x={48}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="var(--muted)"
                  >
                    {formatCompactVnd(tickValue, currencyCode)}
                  </text>
                );
              })}

              {/* Hover column highlight */}
              {activeBar ? (
                <rect
                  x={activeBar.slotLeft}
                  y={PLOT_TOP}
                  width={activeBar.slotWidth}
                  height={PLOT_HEIGHT}
                  fill="var(--panel)"
                  opacity={0.75}
                />
              ) : null}

              {/* Bars */}
              <g fill="var(--blue)">
                {chartMath.bars.map((bar) => {
                  const isHovered = activeIndex === bar.idx;
                  const showOutline =
                    bar.bucket.isHighlighted || isHovered;
                  const effectiveHeight =
                    bar.height > 0
                      ? bar.height
                      : bar.bucket.isHighlighted
                        ? 2
                        : 0;
                  const effectiveY =
                    bar.height > 0
                      ? bar.y
                      : PLOT_BOTTOM - effectiveHeight;

                  return (
                    <g
                      key={bar.bucket.key}
                      tabIndex={0}
                      role="button"
                      aria-label={`${bar.bucket.fullLabel}: ${formatMoney(bar.bucket.amountMinor, currencyCode)}`}
                      onMouseEnter={() => setActiveIndex(bar.idx)}
                      onFocus={() => setActiveIndex(bar.idx)}
                      onBlur={() =>
                        setActiveIndex((prev) =>
                          prev === bar.idx ? null : prev,
                        )
                      }
                      className="cursor-pointer outline-none"
                    >
                      {/* Invisible full-column hit target */}
                      <rect
                        x={bar.slotLeft}
                        y={PLOT_TOP}
                        width={bar.slotWidth}
                        height={PLOT_HEIGHT + 24}
                        fill="transparent"
                      />
                      {effectiveHeight > 0 ? (
                        <rect
                          x={bar.x}
                          y={effectiveY}
                          width={bar.width}
                          height={effectiveHeight}
                          fill={bar.height > 0 ? "var(--blue)" : "transparent"}
                          stroke={showOutline ? "var(--text)" : undefined}
                          strokeWidth={showOutline ? 1.5 : undefined}
                        />
                      ) : null}
                    </g>
                  );
                })}
              </g>

              {/* Broken-bar diagonal cut + callout for clipped outlier */}
              {outlierBar ? (
                <g pointerEvents="none">
                  <path
                    d={`M ${(outlierBar.x - 4.5).toFixed(1)} 66 L ${(outlierBar.x + outlierBar.width + 4.5).toFixed(1)} 56`}
                    stroke="var(--bg)"
                    strokeWidth={6}
                    fill="none"
                  />
                  <text
                    x={
                      outlierBar.centerX < 460
                        ? outlierBar.x + outlierBar.width + 10
                        : outlierBar.x - 10
                    }
                    y={34}
                    textAnchor={outlierBar.centerX < 460 ? "start" : "end"}
                    fontSize={11}
                    fill="var(--muted)"
                  >
                    {`${outlierBar.bucket.fullLabel} · ${formatCompactVnd(outlierBar.bucket.amountMinor, currencyCode)} (cao đột biến)`}
                  </text>
                </g>
              ) : null}

              {/* 7-day moving average polyline (excluding outlier day) */}
              {mode === "day" && chartMath.maPath ? (
                <path
                  d={chartMath.maPath}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              ) : null}

              {/* Empty state notice inside chart when 0 spending */}
              {chartMath.totalAmount === 0 ? (
                <text
                  x={PLOT_LEFT + PLOT_WIDTH / 2}
                  y={PLOT_TOP + PLOT_HEIGHT / 2}
                  textAnchor="middle"
                  fontSize={12}
                  fill="var(--muted)"
                >
                  ∅ chưa có chi tiêu trong khoảng này
                </text>
              ) : null}

              {/* X-axis labels */}
              {chartMath.bars.map((bar) => {
                if (mode === "day") {
                  const day = bar.bucket.dayNumber ?? bar.idx + 1;
                  const lastDay = chartMath.bars.length;
                  const isLast = day === lastDay;
                  const minGapFromLast = elapsedInfo.isCurrent ? 3 : 2;
                  const showTick =
                    isLast ||
                    ((day === 1 || day % 5 === 0) &&
                      lastDay - day >= minGapFromLast);
                  if (!showTick) {
                    return null;
                  }
                  const isTodayLabel = isLast && elapsedInfo.isCurrent;
                  const alignRight =
                    isTodayLabel && bar.centerX > PLOT_RIGHT - 42;
                  return (
                    <text
                      key={bar.bucket.key}
                      x={
                        alignRight
                          ? Math.min(PLOT_RIGHT, bar.centerX + 18)
                          : bar.centerX
                      }
                      y={240}
                      textAnchor={alignRight ? "end" : "middle"}
                      fontSize={11}
                      fill={isTodayLabel ? "var(--text)" : "var(--muted)"}
                    >
                      {isTodayLabel ? `${day} hôm nay` : String(day)}
                    </text>
                  );
                }

                return (
                  <text
                    key={bar.bucket.key}
                    x={bar.centerX}
                    y={240}
                    textAnchor="middle"
                    fontSize={11}
                    fill={
                      bar.bucket.isHighlighted ? "var(--text)" : "var(--muted)"
                    }
                  >
                    {bar.bucket.shortLabel}
                  </text>
                );
              })}
            </svg>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="tally-sw"
                style={{ backgroundColor: "var(--blue)" }}
                aria-hidden="true"
              />
              <span>{legendBarLabel}</span>
            </span>

            {mode === "day" && chartMath.maPath ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-[2px] w-4 bg-[var(--accent)] align-middle"
                  aria-hidden="true"
                />
                <span>
                  {outlierBar
                    ? `trung bình 7 ngày (không tính ${outlierBar.bucket.dayNumber}/${monthNum})`
                    : "trung bình 7 ngày"}
                </span>
              </span>
            ) : null}

            {mode === "day" && elapsedInfo.isCurrent ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="tally-sw border-[1.5px] border-[var(--text)]"
                  aria-hidden="true"
                />
                <span>hôm nay</span>
              </span>
            ) : null}

            {mode === "month" ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="tally-sw border-[1.5px] border-[var(--text)]"
                  aria-hidden="true"
                />
                <span>tháng đang chọn</span>
              </span>
            ) : null}
          </div>
        </div>
      )}
    </Pane>
  );
}
