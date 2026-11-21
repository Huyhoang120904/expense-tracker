import { useMemo, useState, type FormEvent } from "react";
import { Pane } from "@/components/ui/pane";
import { computeBudgetOverview, useBudgets } from "@/hooks/use-budgets";
import { useMonthlySummary } from "@/hooks/use-ledger";
import type { Category } from "@/lib/api";
import { getCategoryColor } from "@/lib/category-colors";
import {
  formatAmountNumber,
  formatMoney,
  formatMonthShort,
  formatPercentVi,
  getCurrencyDisplayInfo,
  getCurrentMonth,
  parseAmountMinorInput,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CategoriesViewProps {
  month: string;
  onMonthChange: (nextMonth: string) => void;
  categories: Category[];
  isLoadingCategories: boolean;
  canWrite?: boolean;
  onOpenMonthlyIncome?: () => void;
  onBrowseCategory: (categoryId: string) => void;
  onNotify?: (message: string, tone?: "success" | "warn" | "error") => void;
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

export function CategoriesView({
  month,
  onMonthChange,
  categories,
  isLoadingCategories,
  canWrite = false,
  onOpenMonthlyIncome,
  onBrowseCategory,
  onNotify,
}: CategoriesViewProps) {
  const summaryQuery = useMonthlySummary(month);
  const { budgets, setCategoryBudget, removeCategoryBudget } = useBudgets();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const currency = summaryQuery.data?.currency_code ?? "VND";
  const { symbol: currencySymbol, symbolPosition } =
    getCurrencyDisplayInfo(currency);

  const budgetOverview = useMemo(
    () => computeBudgetOverview(budgets, summaryQuery.data, categories),
    [budgets, summaryQuery.data, categories],
  );

  const spendMap = useMemo(
    () =>
      new Map(
        (summaryQuery.data?.by_category ?? []).map((item) => [
          item.category_id,
          item,
        ]),
      ),
    [summaryQuery.data],
  );

  const usageMap = useMemo(
    () => new Map(budgetOverview.items.map((item) => [item.categoryId, item])),
    [budgetOverview.items],
  );

  const activeCategories = useMemo(
    () => categories.filter((c) => !c.archived),
    [categories],
  );
  const archivedCategories = useMemo(
    () => categories.filter((c) => c.archived),
    [categories],
  );

  const configuredBudgetCount = budgetOverview.items.length;
  const currentMonth = getCurrentMonth();

  const overallBudgetRatio =
    budgetOverview.hasBudgets && budgetOverview.totalBudgetMinor > 0
      ? budgetOverview.totalSpentInBudgetedMinor /
        budgetOverview.totalBudgetMinor
      : null;

  const overallBudgetStatus =
    overallBudgetRatio === null
      ? "ok"
      : budgetOverview.totalSpentInBudgetedMinor >
          budgetOverview.totalBudgetMinor
        ? "over"
        : budgetOverview.totalSpentInBudgetedMinor * 5 >=
            budgetOverview.totalBudgetMinor * 4
          ? "warn"
          : "ok";

  function clearDraft(categoryId: string) {
    setDrafts((prev) => {
      if (!(categoryId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    setErrors((prev) => {
      if (!(categoryId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
  }

  function handleSaveBudget(event: FormEvent, cat: Category) {
    event.preventDefault();
    const existingBudget = budgets[cat.id];
    const raw =
      cat.id in drafts
        ? (drafts[cat.id] ?? "")
        : existingBudget
          ? formatAmountNumber(existingBudget, currency)
          : "";

    const trimmed = raw.trim();
    if (!trimmed) {
      if (existingBudget !== undefined) {
        removeCategoryBudget(cat.id);
        onNotify?.(
          `đã xóa hạn mức cho ${cat.name.toLowerCase()}`,
          "success",
        );
      }
      clearDraft(cat.id);
      return;
    }

    const parsedMinor = parseAmountMinorInput(trimmed, currency);
    if (parsedMinor === null) {
      setErrors((prev) => ({
        ...prev,
        [cat.id]: "số tiền không hợp lệ (vd: 4tr, 1.800.000, 800k)",
      }));
      onNotify?.(
        `hạn mức không hợp lệ cho ${cat.name.toLowerCase()}`,
        "warn",
      );
      return;
    }

    setCategoryBudget(cat.id, parsedMinor);
    clearDraft(cat.id);
    onNotify?.(
      `đã lưu hạn mức ${cat.name.toLowerCase()}: ${formatMoney(parsedMinor, currency)}`,
      "success",
    );
  }

  function handleRemoveBudget(cat: Category) {
    removeCategoryBudget(cat.id);
    clearDraft(cat.id);
    onNotify?.(`đã xóa hạn mức cho ${cat.name.toLowerCase()}`, "success");
  }

  const incomeMinor = summaryQuery.data?.income_minor ?? 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Pane title="tổng ngân sách tháng">
          <div className="tally-big tally-num">
            {budgetOverview.hasBudgets ? (
              renderSplitMoney(budgetOverview.totalBudgetMinor, currency)
            ) : symbolPosition === "prefix" ? (
              <>
                <span className="tally-cur">{currencySymbol}</span>–
              </>
            ) : (
              <>
                – <span className="tally-cur">{currencySymbol}</span>
              </>
            )}
          </div>
          <div className="tally-sub tally-num">
            {configuredBudgetCount} danh mục đã đặt hạn mức ·{" "}
            {formatMonthShort(month)}
          </div>
        </Pane>

        <Pane title="đã chi trong ngân sách">
          {summaryQuery.isLoading && !summaryQuery.data ? (
            <div className="space-y-2.5">
              <div className="tally-sk h-[26px] w-44" />
              <div className="tally-sk h-[14px] w-36" />
            </div>
          ) : (
            <>
              <div className="tally-big tally-num">
                {renderSplitMoney(
                  budgetOverview.totalSpentInBudgetedMinor,
                  currency,
                )}
              </div>
              {overallBudgetRatio !== null ? (
                <div
                  className="tally-bar mt-2.5"
                  role="progressbar"
                  aria-valuenow={Math.round(overallBudgetRatio * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`đã chi ${Math.round(overallBudgetRatio * 100)}% tổng ngân sách`}
                >
                  <div
                    className={cn(
                      "tally-bar-fill",
                      overallBudgetStatus === "over"
                        ? "is-over"
                        : overallBudgetStatus === "warn"
                          ? "is-warn"
                          : "is-ok",
                    )}
                    style={{
                      width: `${Math.min(100, Math.max(0, overallBudgetRatio * 100))}%`,
                    }}
                  />
                  <i
                    className="tally-tick"
                    style={{ left: "80%" }}
                    aria-hidden="true"
                  />
                </div>
              ) : null}
              <div className="tally-sub tally-num">
                {overallBudgetRatio !== null ? (
                  <>
                    <span
                      className={
                        overallBudgetStatus === "over"
                          ? "tally-st-over"
                          : overallBudgetStatus === "warn"
                            ? "tally-st-warn"
                            : "tally-st-ok"
                      }
                    >
                      {overallBudgetStatus === "over"
                        ? "✕ "
                        : overallBudgetStatus === "warn"
                          ? "▲ "
                          : ""}
                      {formatPercentVi(overallBudgetRatio, 1)}
                    </span>{" "}
                    tổng ngân sách
                    {budgetOverview.overItems.length > 0
                      ? ` · ${budgetOverview.overItems.length} danh mục vượt mức`
                      : ""}
                  </>
                ) : (
                  "chưa đặt hạn mức để tính tỷ lệ"
                )}
              </div>
            </>
          )}
        </Pane>

        <Pane title="thu nhập tháng">
          {summaryQuery.isLoading && !summaryQuery.data ? (
            <div className="space-y-2.5">
              <div className="tally-sk h-[26px] w-44" />
              <div className="tally-sk h-[14px] w-36" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="tally-big tally-num">
                  {summaryQuery.data ? (
                    renderSplitMoney(incomeMinor, currency)
                  ) : (
                    <span>–</span>
                  )}
                </div>
                {canWrite && onOpenMonthlyIncome ? (
                  <button
                    type="button"
                    onClick={onOpenMonthlyIncome}
                    className="tally-btn tally-btn-sm"
                  >
                    đặt thu nhập
                  </button>
                ) : null}
              </div>
              <div className="tally-sub tally-num">
                {incomeMinor > 0 && budgetOverview.hasBudgets ? (
                  budgetOverview.totalBudgetMinor > incomeMinor ? (
                    <span className="tally-st-warn">
                      ▲ tổng ngân sách cao hơn thu nhập{" "}
                      {formatMoney(
                        budgetOverview.totalBudgetMinor - incomeMinor,
                        currency,
                      )}
                    </span>
                  ) : (
                    <>
                      tổng ngân sách bằng{" "}
                      {formatPercentVi(
                        budgetOverview.totalBudgetMinor / incomeMinor,
                        1,
                      )}{" "}
                      thu nhập tháng
                    </>
                  )
                ) : incomeMinor > 0 ? (
                  "chưa có hạn mức để đối chiếu thu nhập"
                ) : (
                  `chưa ghi nhận thu nhập cho ${formatMonthShort(month)}`
                )}
              </div>
            </>
          )}
        </Pane>
      </div>

      <Pane title="ngân sách theo danh mục">
        {isLoadingCategories && categories.length === 0 ? (
          <div aria-busy="true">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="tally-row space-y-2.5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="tally-sk h-[14px] w-40" />
                  <div className="tally-sk h-[14px] w-32" />
                </div>
                <div className="tally-sk h-[8px] w-full" />
              </div>
            ))}
            <p className="mt-3 text-[12px] text-[var(--muted)]" role="status">
              đang tải danh mục
              <span className="tally-cursor" aria-hidden="true">
                █
              </span>
            </p>
          </div>
        ) : activeCategories.length === 0 ? (
          <div className="border border-dashed border-[var(--bstrong)] bg-[var(--panel)] px-5 py-6">
            <p className="text-[15px] font-semibold">
              <span className="text-[var(--muted)]" aria-hidden="true">
                ∅{" "}
              </span>
              chưa có danh mục đang hoạt động
            </p>
            <p className="mt-1.5 text-[12px] text-[var(--muted)]">
              danh mục được đồng bộ từ sổ chi tiêu backend để thiết lập hạn mức
              theo tháng.
            </p>
          </div>
        ) : (
          <ul>
            {activeCategories.map((cat) => {
              const spend = spendMap.get(cat.id);
              const spentMinor = spend?.net_spending_minor ?? 0;
              const existingBudget = budgets[cat.id];
              const usage = usageMap.get(cat.id);
              const isDirty = cat.id in drafts;
              const inputValue = isDirty
                ? (drafts[cat.id] ?? "")
                : existingBudget !== undefined
                  ? formatAmountNumber(existingBudget, currency)
                  : "";
              const rowError = errors[cat.id];
              const swatchColor = getCategoryColor(cat.id, cat.name);

              return (
                <li
                  key={cat.id}
                  className="tally-row flex flex-col gap-2.5 py-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="tally-sw"
                        style={{ backgroundColor: swatchColor }}
                        aria-hidden="true"
                      />
                      <span className="truncate font-semibold text-[var(--text)] lowercase">
                        {cat.name}
                      </span>
                      <span className="text-[11px] text-[var(--muted)]">
                        {cat.id}
                      </span>
                    </div>

                    <div className="tally-num min-w-0 max-w-full break-words text-[12px] text-[var(--muted)]">
                      {usage ? (
                        <span>
                          <span className="text-[var(--text)]">
                            {formatAmountNumber(spentMinor, currency)}
                          </span>{" "}
                          / {formatMoney(usage.budgetMinor, currency)}
                        </span>
                      ) : (
                        <span>
                          đã chi tháng này:{" "}
                          <span className="text-[var(--text)]">
                            {formatMoney(spentMinor, currency)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {usage ? (
                    <div className="grid grid-cols-1 items-center gap-2.5 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-3.5">
                      <div
                        className="tally-bar"
                        role="progressbar"
                        aria-valuenow={Math.round(usage.pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${cat.name}: ${Math.round(usage.pct)}% hạn mức`}
                      >
                        <div
                          className={cn(
                            "tally-bar-fill",
                            usage.status === "over"
                              ? "is-over"
                              : usage.status === "warn"
                                ? "is-warn"
                                : "is-ok",
                          )}
                          style={{ width: `${usage.barWidthPct}%` }}
                        />
                        <i
                          className="tally-tick"
                          style={{ left: "80%" }}
                          aria-hidden="true"
                        />
                      </div>

                      <span
                        className={cn(
                          "tally-num text-[12px] lg:text-right",
                          usage.status === "over"
                            ? "tally-st-over"
                            : usage.status === "warn"
                              ? "tally-st-warn"
                              : "tally-st-ok",
                        )}
                      >
                        {usage.status === "over"
                          ? `✕ ${Math.round(usage.pct)}% · vượt ${formatAmountNumber(usage.overMinor, currency)}`
                          : usage.status === "warn" && usage.pct >= 100
                            ? `▲ ${Math.round(usage.pct)}% · chạm hạn mức`
                            : usage.status === "warn"
                              ? `▲ ${Math.round(usage.pct)}% · gần hạn mức`
                              : `${Math.round(usage.pct)}% · còn ${formatAmountNumber(usage.remainingMinor, currency)}`}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <form
                      onSubmit={(event) => handleSaveBudget(event, cat)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <label htmlFor={`budget-input-${cat.id}`} className="sr-only">
                        hạn mức tháng cho {cat.name}
                      </label>
                      <input
                        id={`budget-input-${cat.id}`}
                        type="text"
                        inputMode="decimal"
                        value={inputValue}
                        onChange={(event) => {
                          const nextVal = event.target.value;
                          setDrafts((prev) => ({
                            ...prev,
                            [cat.id]: nextVal,
                          }));
                          if (errors[cat.id]) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next[cat.id];
                              return next;
                            });
                          }
                        }}
                        placeholder="hạn mức (vd: 4tr, 800k)"
                        className={cn(
                          "tally-num h-[30px] w-full max-w-[190px] rounded-[2px] border bg-transparent px-2 text-[12px] text-[var(--text)] placeholder:text-[var(--muted)] hover:border-[var(--bstrong)] focus-visible:border-[var(--blue)] sm:w-[190px]",
                          rowError
                            ? "border-[var(--red)]"
                            : "border-[var(--border)]",
                        )}
                      />

                      <button
                        type="submit"
                        className={cn(
                          "tally-btn tally-btn-sm",
                          isDirty && "tally-btn-primary",
                        )}
                      >
                        lưu
                      </button>

                      {existingBudget !== undefined ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveBudget(cat)}
                          className="tally-btn tally-btn-sm text-[var(--muted)] hover:text-[var(--text)]"
                        >
                          xóa
                        </button>
                      ) : null}
                    </form>

                    <button
                      type="button"
                      onClick={() => onBrowseCategory(cat.id)}
                      className="tally-btn tally-btn-sm text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      xem giao dịch →
                    </button>
                  </div>

                  {rowError ? (
                    <p className="tally-st-over text-[11px]" role="alert">
                      ✕ {rowError}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--muted)]">
          <span>
            │ đánh dấu mức cảnh báo 80% · thanh gạch chéo = vượt ngân sách · hạn
            mức được lưu cục bộ trên trình duyệt
          </span>
          {month !== currentMonth ? (
            <button
              type="button"
              onClick={() => onMonthChange(currentMonth)}
              className="text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline cursor-pointer"
            >
              về tháng hiện tại
            </button>
          ) : null}
        </div>
      </Pane>

      {archivedCategories.length > 0 ? (
        <Pane title="danh mục đã lưu trữ">
          <ul>
            {archivedCategories.map((cat) => {
              const spend = spendMap.get(cat.id);
              const spentMinor = spend?.net_spending_minor ?? 0;

              return (
                <li
                  key={cat.id}
                  className="tally-row flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="tally-sw"
                      style={{
                        backgroundColor: getCategoryColor(cat.id, cat.name),
                      }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-[var(--muted)] lowercase">
                      {cat.name}
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">
                      {cat.id}
                    </span>
                    <span className="tally-tag">đã lưu trữ</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="tally-num text-[12px] text-[var(--muted)]">
                      {spend
                        ? `${formatMoney(spentMinor, currency)} ròng`
                        : "chưa có chi tiêu tháng này"}
                    </span>
                    <button
                      type="button"
                      onClick={() => onBrowseCategory(cat.id)}
                      className="tally-btn tally-btn-sm text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      xem giao dịch →
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Pane>
      ) : null}
    </div>
  );
}
