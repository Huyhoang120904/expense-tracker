import { useMemo } from "react";
import { Pane } from "@/components/ui/pane";
import type { Category, Transaction } from "@/lib/api";
import { getCategoryColor } from "@/lib/category-colors";
import {
  formatAmountNumber,
  formatLocalDate,
  getCurrencyDisplayInfo,
  TRANSACTION_SOURCE_LABELS,
  TRANSACTION_TYPE_META,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RecentActivityProps {
  transactions: Transaction[];
  categories: Category[];
  isLoading: boolean;
  onSelectTransaction: (id: string) => void;
  onViewAll: () => void;
}

const UNICODE_MINUS = "\u2212";

function TransactionAmountCell({ tx }: { tx: Transaction }) {
  const { symbol, symbolPosition } = getCurrencyDisplayInfo(tx.currency_code);
  const absFormatted = formatAmountNumber(tx.amount_minor, tx.currency_code);
  const amountBody =
    symbolPosition === "suffix"
      ? `${absFormatted} ${symbol}`
      : `${symbol}${absFormatted}`;

  if (tx.type === "refund" || tx.type === "income") {
    return (
      <span className="whitespace-nowrap text-right text-[var(--text)] tally-num">
        <span className="text-[var(--green)]">+</span>
        {amountBody}
      </span>
    );
  }

  if (tx.type === "expense") {
    return (
      <span className="whitespace-nowrap text-right text-[var(--text)] tally-num">
        {UNICODE_MINUS}
        {amountBody}
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap text-right text-[var(--muted)] tally-num">
      {amountBody}
    </span>
  );
}

export function RecentActivity({
  transactions,
  categories,
  isLoading,
  onSelectTransaction,
  onViewAll,
}: RecentActivityProps) {
  const categoryMap = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories],
  );

  return (
    <Pane
      title="giao dịch gần đây"
      className="flex flex-[1.2_1_460px] flex-col"
    >
      {isLoading && transactions.length === 0 ? (
        <div className="space-y-1 pt-1">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="tally-row flex min-h-[42px] items-center justify-between gap-3"
            >
              <div className="tally-sk h-3.5 w-12" />
              <div className="tally-sk h-3.5 flex-1" />
              <div className="tally-sk h-3.5 w-24" />
            </div>
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center border border-dashed border-[var(--bstrong)] bg-[var(--panel)] p-6 text-center">
          <p className="font-semibold text-[var(--text)]">
            <span className="mr-1.5 text-[var(--muted)]">∅</span>
            chưa có giao dịch gần đây
          </p>
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">
            các giao dịch mới nhất trong tháng sẽ hiển thị tại đây.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div
            aria-hidden="true"
            className="tally-row hidden min-h-[30px] items-center gap-3 text-[12px] text-[var(--muted)] sm:grid sm:grid-cols-[84px_minmax(0,1fr)_124px_112px]"
          >
            <span>ngày</span>
            <span>nơi chi</span>
            <span>danh mục</span>
            <span className="text-right">số tiền</span>
          </div>

          <ul className="m-0 list-none p-0">
            {transactions.map((tx) => {
              const category =
                tx.category_id !== null
                  ? categoryMap.get(tx.category_id)
                  : undefined;
              const typeMeta = TRANSACTION_TYPE_META[tx.type];
              const fullMerchant =
                tx.merchant?.trim() ||
                tx.note?.trim() ||
                (category?.name ?? typeMeta.label);
              const categoryColor = getCategoryColor(
                tx.category_id,
                category?.name,
              );
              const typeTag =
                tx.type === "refund"
                  ? "hoàn tiền"
                  : tx.type === "income"
                    ? "thu nhập"
                    : tx.type === "transfer"
                      ? "chuyển khoản"
                      : null;
              const sourceTag =
                tx.source !== "dashboard"
                  ? TRANSACTION_SOURCE_LABELS[tx.source]
                  : null;
              const primaryTag = typeTag ?? sourceTag;

              return (
                <li key={tx.id} className="tally-row">
                  <button
                    type="button"
                    onClick={() => onSelectTransaction(tx.id)}
                    className={cn(
                      "-mx-1.5 grid min-h-[42px] w-[calc(100%+12px)] cursor-pointer grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3 px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--panel)] sm:grid-cols-[84px_minmax(0,1fr)_124px_112px]",
                    )}
                  >
                    <span className="whitespace-nowrap text-[var(--muted)] tally-num">
                      {formatLocalDate(tx.transaction_date, "full")}
                    </span>

                    <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          title={fullMerchant}
                          className="min-w-0 truncate text-[var(--text)]"
                        >
                          {fullMerchant}
                        </span>
                        {primaryTag ? (
                          <span className="tally-tag shrink-0">
                            {primaryTag}
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-[11px] text-[var(--muted)] sm:hidden">
                        {tx.category_id !== null
                          ? (category?.name ?? tx.category_id).toLowerCase()
                          : "— chưa phân loại"}
                      </span>
                    </span>

                    <span className="hidden min-w-0 items-center gap-2 sm:flex">
                      {tx.category_id !== null ? (
                        <>
                          <span
                            className="tally-sw"
                            style={{ backgroundColor: categoryColor }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-[var(--muted)]">
                            {(category?.name ?? tx.category_id).toLowerCase()}
                          </span>
                        </>
                      ) : (
                        <span className="truncate text-[var(--muted)]">
                          — chưa phân loại
                        </span>
                      )}
                    </span>

                    <TransactionAmountCell tx={tx} />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-auto pt-3 text-[12px]">
            <button
              type="button"
              onClick={onViewAll}
              className="inline-flex cursor-pointer items-center gap-2 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              <span>xem tất cả giao dịch →</span>
              <span className="tally-kbd">t</span>
            </button>
          </div>
        </div>
      )}
    </Pane>
  );
}
