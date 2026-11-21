import { useMemo } from "react";
import { Pane } from "@/components/ui/pane";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Category, MonthlySummary } from "@/lib/api";
import { getCategoryColor } from "@/lib/category-colors";
import { formatMoney, formatPercentVi } from "@/lib/format";

export interface CategoryBreakdownProps {
  summary?: MonthlySummary;
  categories: Category[];
  isLoading: boolean;
  onSelectCategory: (categoryId: string | null) => void;
}

export function CategoryBreakdown({
  summary,
  categories,
  isLoading,
  onSelectCategory,
}: CategoryBreakdownProps) {
  const categoryMap = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories],
  );

  const items = useMemo(() => {
    const source = summary?.by_category ?? [];
    return [...source].sort(
      (a, b) => b.net_spending_minor - a.net_spending_minor,
    );
  }, [summary]);

  const currency = summary?.currency_code ?? "VND";

  const positiveItems = useMemo(
    () => items.filter((item) => item.net_spending_minor > 0),
    [items],
  );

  const positiveTotal = useMemo(
    () =>
      positiveItems.reduce((sum, item) => sum + item.net_spending_minor, 0),
    [positiveItems],
  );

  return (
    <Pane
      title="theo danh mục"
      className="flex flex-[1_1_320px] flex-col"
    >
      {isLoading && !summary ? (
        <div className="space-y-3 pt-1">
          <div className="tally-sk h-3 w-full" />
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-3 py-1"
            >
              <div className="tally-sk h-3.5 w-28" />
              <div className="tally-sk h-3.5 w-24" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center border border-dashed border-[var(--bstrong)] bg-[var(--panel)] p-6 text-center">
          <p className="font-semibold text-[var(--text)]">
            <span className="mr-1.5 text-[var(--muted)]">∅</span>
            chưa có chi tiêu theo danh mục
          </p>
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">
            các khoản chi và hoàn tiền trong tháng sẽ tự tổng hợp theo danh mục tại đây.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          {positiveTotal > 0 ? (
            <div
              role="img"
              aria-label={`Cơ cấu chi tiêu theo ${positiveItems.length} danh mục`}
              className="mb-3.5 flex h-3 gap-[2px]"
            >
              {positiveItems.map((item) => {
                const cat =
                  item.category_id !== null
                    ? categoryMap.get(item.category_id)
                    : undefined;
                const color = getCategoryColor(item.category_id, cat?.name);
                return (
                  <div
                    key={item.category_id ?? "__uncategorized"}
                    style={{
                      flex: `${item.net_spending_minor} 1 0`,
                      backgroundColor: color,
                    }}
                  />
                );
              })}
            </div>
          ) : null}

          <ul className="m-0 mb-2 list-none p-0">
            {items.map((item) => {
              const cat =
                item.category_id !== null
                  ? categoryMap.get(item.category_id)
                  : undefined;
              const label =
                item.category_id === null
                  ? "chưa phân loại"
                  : (cat?.name ?? item.category_id).toLowerCase();
              const color = getCategoryColor(item.category_id, cat?.name);
              const shareText =
                positiveTotal > 0 && item.net_spending_minor > 0
                  ? formatPercentVi(item.net_spending_minor / positiveTotal, 1)
                  : "ròng";

              const rowButton = (
                <button
                  type="button"
                  onClick={() => onSelectCategory(item.category_id)}
                  className="-mx-1.5 grid min-h-[34px] w-[calc(100%+12px)] cursor-pointer grid-cols-[10px_minmax(0,1fr)_auto_52px] items-center gap-2.5 px-1.5 text-left transition-colors hover:bg-[var(--panel)]"
                >
                  <span
                    className="tally-sw"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[var(--text)]">{label}</span>
                    {cat?.archived ? (
                      <span className="tally-tag">lưu trữ</span>
                    ) : null}
                  </span>
                  <span className="whitespace-nowrap text-[var(--muted)] tally-num">
                    {formatMoney(item.net_spending_minor, currency)}
                  </span>
                  <span className="text-right text-[var(--text)] tally-num">
                    {shareText}
                  </span>
                </button>
              );

              return (
                <li key={item.category_id ?? "__uncategorized"}>
                  {item.refunds_minor > 0 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{rowButton}</TooltipTrigger>
                      <TooltipContent>
                        {formatMoney(item.gross_expenses_minor, currency)} chi
                        gộp {"\u2212"}{" "}
                        {formatMoney(item.refunds_minor, currency)} hoàn tiền
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    rowButton
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-auto flex justify-between border-t border-[var(--border)] pt-2.5 text-[12px] text-[var(--muted)] tally-num">
            <span>tổng</span>
            <span>{formatMoney(positiveTotal, currency)}</span>
          </div>
        </div>
      )}
    </Pane>
  );
}
