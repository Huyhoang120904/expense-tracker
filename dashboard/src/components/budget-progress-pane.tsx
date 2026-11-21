import { Pane } from "@/components/ui/pane";
import type { BudgetItemUsage, BudgetOverview } from "@/hooks/use-budgets";
import { getCategoryColor } from "@/lib/category-colors";
import { formatAmountNumber, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BudgetProgressPaneProps {
  budgetOverview: BudgetOverview;
  currencyCode: string;
  isLoading: boolean;
  onOpenBudgets?: () => void;
  onSelectCategory: (categoryId: string) => void;
}

function getBudgetStatusCopy(
  item: BudgetItemUsage,
  currencyCode: string,
): { text: string; toneClass: string } {
  const roundedPct = Math.round(item.pct);
  if (item.status === "over") {
    return {
      text: `✕ ${roundedPct}% · vượt ${formatAmountNumber(item.overMinor, currencyCode)}`,
      toneClass: "tally-st-over",
    };
  }
  if (item.status === "warn") {
    if (item.pct >= 100) {
      return {
        text: `▲ ${roundedPct}% · chạm hạn mức`,
        toneClass: "tally-st-warn",
      };
    }
    return {
      text: `▲ ${roundedPct}% · gần hạn mức`,
      toneClass: "tally-st-warn",
    };
  }
  return {
    text: `${roundedPct}%`,
    toneClass: "tally-st-ok",
  };
}

export function BudgetProgressPane({
  budgetOverview,
  currencyCode,
  isLoading,
  onOpenBudgets,
  onSelectCategory,
}: BudgetProgressPaneProps) {
  return (
    <Pane
      title="ngân sách"
      className="flex flex-[1_1_420px] flex-col"
    >
      {isLoading ? (
        <div className="space-y-4 pt-1">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="space-y-2 border-b border-dashed border-[var(--border)] pb-3"
            >
              <div className="flex justify-between gap-3">
                <div className="tally-sk h-3.5 w-28" />
                <div className="tally-sk h-3.5 w-32" />
              </div>
              <div className="tally-sk h-2 w-full" />
            </div>
          ))}
        </div>
      ) : budgetOverview.hasBudgets ? (
        <div className="flex flex-1 flex-col">
          <ul className="m-0 list-none p-0">
            {budgetOverview.items.map((item) => {
              const color = getCategoryColor(
                item.categoryId,
                item.categoryName,
              );
              const statusCopy = getBudgetStatusCopy(item, currencyCode);
              const fillClass =
                item.status === "over"
                  ? "is-over"
                  : item.status === "warn"
                    ? "is-warn"
                    : "is-ok";

              return (
                <li
                  key={item.categoryId}
                  className="border-b border-dashed border-[var(--border)]"
                >
                  <button
                    type="button"
                    onClick={() => onSelectCategory(item.categoryId)}
                    className="-mx-1.5 grid w-[calc(100%+12px)] cursor-pointer gap-2 px-1.5 py-2.5 text-left transition-colors hover:bg-[var(--panel)]"
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span
                          className="tally-sw"
                          style={{ backgroundColor: color }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-[var(--text)]">
                          {item.categoryName.toLowerCase()}
                        </span>
                      </span>
                      <span className="min-w-0 max-w-full break-words whitespace-normal text-[var(--muted)] tally-num">
                        {formatAmountNumber(item.spentMinor, currencyCode)} /{" "}
                        {formatMoney(item.budgetMinor, currencyCode)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 items-center gap-2 lg:grid-cols-[minmax(0,1fr)_190px] lg:gap-3.5">
                      <div
                        className="tally-bar"
                        role="progressbar"
                        aria-valuenow={Math.round(item.pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Ngân sách ${item.categoryName}: ${Math.round(item.pct)}%`}
                      >
                        <div
                          className={cn("tally-bar-fill", fillClass)}
                          style={{ width: `${item.barWidthPct}%` }}
                        />
                        <i
                          className="tally-tick"
                          style={{ left: "80%" }}
                          aria-hidden="true"
                        />
                      </div>

                      <span
                        className={cn(
                          "text-[12px] tally-num",
                          statusCopy.toneClass,
                        )}
                      >
                        {statusCopy.text}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-[12px] text-[var(--muted)]">
            <span>
              │ đánh dấu mức cảnh báo 80% · thanh gạch chéo = vượt ngân sách
            </span>
            {onOpenBudgets ? (
              <button
                type="button"
                onClick={onOpenBudgets}
                className="inline-flex cursor-pointer items-center gap-1.5 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              >
                <span>quản lý ngân sách →</span>
                <span className="tally-kbd">b</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <div className="flex flex-col gap-3 border border-dashed border-[var(--bstrong)] bg-[var(--panel)] p-5">
            <p className="text-[14px] font-semibold text-[var(--text)]">
              <span className="mr-1.5 text-[var(--muted)]">○</span>
              chưa thiết lập ngân sách tháng
            </p>
            <p className="text-[12px] leading-relaxed text-[var(--muted)]">
              đặt hạn mức chi tiêu theo từng danh mục để bật cảnh báo tiến độ,
              vạch đánh dấu 80% và theo dõi các khoản vượt ngân sách ngay trên
              bảng điều khiển.
            </p>
            {onOpenBudgets ? (
              <div>
                <button
                  type="button"
                  onClick={onOpenBudgets}
                  className="tally-btn tally-btn-sm"
                >
                  <span>thiết lập ngân sách</span>
                  <span className="tally-kbd">b</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Pane>
  );
}
