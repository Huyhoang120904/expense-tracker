import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { useCreateTransaction } from "@/hooks/use-ledger";
import { ApiClientError, type Category, type TransactionType } from "@/lib/api";
import { getCategoryColor } from "@/lib/category-colors";
import {
  formatAmountNumber,
  formatLocalDate,
  formatMoney,
  getCurrencyDisplayInfo,
  getTodayLocalDate,
  getYesterdayLocalDate,
  parseAmountMinorInput,
} from "@/lib/format";

export interface QuickAddTodayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: TransactionType;
  currencyCode: string;
  categories: Category[];
  recentMerchants?: string[];
  onSuccess: (message: string) => void;
}

const TRANSACTION_TYPES: ReadonlyArray<{
  value: TransactionType;
  label: string;
}> = [
  { value: "expense", label: "khoản chi" },
  { value: "refund", label: "hoàn tiền" },
  { value: "income", label: "thu nhập" },
  { value: "transfer", label: "chuyển khoản" },
];

const EXPENSE_INCREMENTS = [10_000, 50_000, 100_000, 500_000] as const;
const INCOME_INCREMENTS = [1_000_000, 5_000_000, 10_000_000, 25_000_000] as const;

function defaultCategoryForType(
  type: TransactionType,
  activeCategories: Category[],
): string | null {
  if (type === "transfer") {
    return null;
  }
  const preferredId = type === "income" ? "salary" : "food";
  if (activeCategories.some((c) => c.id === preferredId)) {
    return preferredId;
  }
  return activeCategories[0]?.id ?? null;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function QuickAddTodayDialog({
  open,
  onOpenChange,
  defaultType = "expense",
  currencyCode,
  categories,
  recentMerchants,
  onSuccess,
}: QuickAddTodayDialogProps) {
  const activeCategories = useMemo(
    () => categories.filter((c) => !c.archived),
    [categories],
  );
  const uniqueRecentMerchants = useMemo(() => {
    if (!recentMerchants || recentMerchants.length === 0) {
      return [] as string[];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of recentMerchants) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(trimmed);
      if (result.length >= 6) {
        break;
      }
    }
    return result;
  }, [recentMerchants]);

  const today = getTodayLocalDate();
  const yesterday = getYesterdayLocalDate();
  const currencyInfo = useMemo(
    () => getCurrencyDisplayInfo(currencyCode),
    [currencyCode],
  );

  const [type, setType] = useState<TransactionType>(defaultType);
  const [transactionDate, setTransactionDate] = useState<string>(today);
  const [amountInput, setAmountInput] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(() =>
    defaultCategoryForType(defaultType, activeCategories),
  );
  const [categoryManuallyPicked, setCategoryManuallyPicked] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const createMutation = useCreateTransaction();

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const currentToday = getTodayLocalDate();
      setType(defaultType);
      setTransactionDate(currentToday);
      setAmountInput("");
      setCategoryId(defaultCategoryForType(defaultType, activeCategories));
      setCategoryManuallyPicked(false);
      setMerchant("");
      setNote("");
      setErrorMessage(null);
      window.setTimeout(() => amountInputRef.current?.focus(), 40);
    }
    wasOpenRef.current = open;
  }, [open, defaultType, activeCategories]);

  useEffect(() => {
    if (open && !categoryManuallyPicked && categoryId === null && type !== "transfer") {
      const nextDefault = defaultCategoryForType(type, activeCategories);
      if (nextDefault) {
        setCategoryId(nextDefault);
      }
    }
  }, [open, categoryManuallyPicked, categoryId, type, activeCategories]);

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    setErrorMessage(null);
    if (!categoryManuallyPicked) {
      setCategoryId(defaultCategoryForType(nextType, activeCategories));
    }
  }

  const parsedAmountMinor = useMemo(
    () => parseAmountMinorInput(amountInput, currencyCode),
    [amountInput, currencyCode],
  );

  const quickIncrements =
    type === "income" ? INCOME_INCREMENTS : EXPENSE_INCREMENTS;

  function handleIncrementAmount(deltaMajor: number) {
    const deltaMinor = Math.round(deltaMajor * currencyInfo.divisor);
    const nextMinor = (parsedAmountMinor ?? 0) + deltaMinor;
    if (currencyInfo.decimals === 0) {
      setAmountInput(formatAmountNumber(nextMinor, currencyCode));
    } else {
      setAmountInput((nextMinor / currencyInfo.divisor).toFixed(currencyInfo.decimals));
    }
    if (errorMessage) {
      setErrorMessage(null);
    }
  }

  async function submitTransaction(keepOpen: boolean) {
    if (createMutation.isPending) {
      return;
    }
    setErrorMessage(null);

    if (parsedAmountMinor === null) {
      setErrorMessage(
        "vui lòng nhập số tiền hợp lệ lớn hơn 0 (ví dụ: 45k, 150.000 hoặc 1,5tr).",
      );
      amountInputRef.current?.focus();
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      setErrorMessage("ngày giao dịch không hợp lệ.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        transaction_date: transactionDate,
        type,
        amount_minor: parsedAmountMinor,
        currency_code: currencyCode,
        category_id: categoryId,
        merchant: merchant.trim() || null,
        note: note.trim() || null,
      });

      const formatted = formatMoney(parsedAmountMinor, currencyCode);
      const dateText =
        transactionDate === getTodayLocalDate()
          ? "hôm nay"
          : formatLocalDate(transactionDate, "full");
      onSuccess(`đã thêm giao dịch ${formatted} cho ${dateText}.`);

      if (keepOpen) {
        setAmountInput("");
        setMerchant("");
        setNote("");
        window.setTimeout(() => amountInputRef.current?.focus(), 30);
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        const fieldHint = err.fields
          ? Object.values(err.fields).join(" ")
          : "";
        setErrorMessage(fieldHint || err.message);
      } else {
        setErrorMessage("không thể lưu giao dịch. vui lòng thử lại.");
      }
    }
  }

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void submitTransaction(true);
      return;
    }

    if (
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      e.key >= "1" &&
      e.key <= "7" &&
      !isEditableElement(e.target)
    ) {
      const idx = Number(e.key) - 1;
      const targetCategory = activeCategories[idx];
      if (targetCategory) {
        e.preventDefault();
        setCategoryId(targetCategory.id);
        setCategoryManuallyPicked(true);
      }
      return;
    }

    if (
      e.key === "Enter" &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      !isEditableElement(e.target) &&
      !(e.target instanceof HTMLButtonElement)
    ) {
      e.preventDefault();
      void submitTransaction(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        floatingTitle="thêm giao dịch"
        hideCloseButton
        onKeyDown={handleDialogKeyDown}
        className="w-[min(680px,calc(100vw-2rem))] max-w-[680px] p-0"
      >
        <DialogDescription className="sr-only">
          ghi nhanh khoản chi tiêu, hoàn tiền, thu nhập hoặc chuyển khoản vào sổ giao dịch
        </DialogDescription>

        <div className="max-h-[90vh] overflow-y-auto px-6 pt-7 pb-6 sm:px-7">
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submitTransaction(false);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className="tally-seg flex-wrap"
                role="group"
                aria-label="loại giao dịch"
              >
                {TRANSACTION_TYPES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={type === item.value}
                    onClick={() => handleTypeChange(item.value)}
                    className="tally-seg-btn h-[34px] px-3.5 text-[13px]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--text)] cursor-pointer"
              >
                <span className="tally-kbd">esc</span>
                <span>đóng</span>
              </button>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor="quick-add-amount"
                  className="block text-[12px] text-[var(--muted)]"
                >
                  số tiền
                </label>
                {parsedAmountMinor !== null ? (
                  <span className="tally-num text-[12px] text-[var(--accent)]">
                    = {formatMoney(parsedAmountMinor, currencyCode)}
                  </span>
                ) : amountInput.trim().length > 0 ? (
                  <span className="text-[12px] text-[var(--red)]">
                    ✕ định dạng chưa hợp lệ
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--muted)]">
                    hỗ trợ 45k, 1,5tr
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2.5 border-b border-[var(--bstrong)] pb-1.5 transition-colors focus-within:border-[var(--blue)]">
                <input
                  ref={amountInputRef}
                  id="quick-add-amount"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    if (errorMessage) {
                      setErrorMessage(null);
                    }
                  }}
                  inputMode="text"
                  autoComplete="off"
                  placeholder={type === "income" ? "25.000.000" : "65.000"}
                  className="tally-num w-full min-w-0 border-0 bg-transparent text-[34px] leading-tight font-semibold tracking-[-0.02em] text-[var(--text)] placeholder:text-[var(--muted)]/45 focus:outline-none focus-visible:outline-none"
                />
                <span className="shrink-0 text-[20px] font-normal text-[var(--muted)]">
                  {currencyInfo.symbol}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                {quickIncrements.map((amountMajor) => {
                  const formattedChip = new Intl.NumberFormat("vi-VN").format(
                    amountMajor,
                  );
                  return (
                    <button
                      key={amountMajor}
                      type="button"
                      onClick={() => handleIncrementAmount(amountMajor)}
                      className="tally-btn tally-btn-sm tally-num"
                    >
                      +{formattedChip}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                htmlFor="quick-add-merchant"
                className="mb-1.5 block text-[12px] text-[var(--muted)]"
              >
                nơi chi
              </label>
              <Input
                id="quick-add-merchant"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                maxLength={200}
                placeholder={
                  type === "income"
                    ? "ví dụ: công ty, khách hàng"
                    : "ví dụ: Highlands Coffee"
                }
              />
              {uniqueRecentMerchants.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-[var(--muted)]">
                  <span>gần đây:</span>
                  {uniqueRecentMerchants.map((item, idx) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1.5"
                    >
                      {idx > 0 ? <span aria-hidden="true">·</span> : null}
                      <button
                        type="button"
                        onClick={() => setMerchant(item)}
                        className="text-[var(--muted)] underline-offset-2 transition-colors hover:text-[var(--text)] hover:underline cursor-pointer"
                      >
                        {item}
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <div
                id="quick-add-cat-label"
                className="mb-1.5 text-[12px] text-[var(--muted)]"
              >
                danh mục <span>(bấm 1–7)</span>
              </div>
              <div
                role="group"
                aria-labelledby="quick-add-cat-label"
                className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]"
              >
                {activeCategories.map((cat, idx) => {
                  const selected = categoryId === cat.id;
                  const hotkey = idx < 7 ? String(idx + 1) : null;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setCategoryId(cat.id);
                        setCategoryManuallyPicked(true);
                      }}
                      className="tally-btn tally-btn-sm h-9 justify-between px-2.5 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="tally-sw"
                          style={{
                            backgroundColor: getCategoryColor(cat.id, cat.name),
                          }}
                          aria-hidden="true"
                        />
                        <span className="truncate lowercase">{cat.name}</span>
                      </span>
                      {hotkey ? (
                        <span className="tally-kbd">{hotkey}</span>
                      ) : null}
                    </button>
                  );
                })}

                <button
                  type="button"
                  aria-pressed={categoryId === null}
                  onClick={() => {
                    setCategoryId(null);
                    setCategoryManuallyPicked(true);
                  }}
                  className="tally-btn tally-btn-sm h-9 justify-between px-2.5 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="tally-sw border border-[var(--bstrong)] bg-transparent"
                      aria-hidden="true"
                    />
                    <span className="truncate text-[var(--muted)]">
                      chưa phân loại
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="quick-add-date"
                className="mb-1.5 block text-[12px] text-[var(--muted)]"
              >
                ngày
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <DateInput
                  id="quick-add-date"
                  value={transactionDate}
                  onChange={setTransactionDate}
                  className="max-w-[220px]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={transactionDate === today}
                    onClick={() => setTransactionDate(today)}
                    className="tally-btn tally-btn-sm"
                  >
                    hôm nay
                  </button>
                  <button
                    type="button"
                    aria-pressed={transactionDate === yesterday}
                    onClick={() => setTransactionDate(yesterday)}
                    className="tally-btn tally-btn-sm"
                  >
                    hôm qua
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="quick-add-note"
                className="mb-1.5 block text-[12px] text-[var(--muted)]"
              >
                ghi chú <span>(không bắt buộc)</span>
              </label>
              <Input
                id="quick-add-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                placeholder="khoản này để làm gì?"
              />
            </div>

            {errorMessage ? (
              <div
                role="alert"
                className="border border-[var(--red)] border-l-[3px] bg-[var(--panel)] px-3 py-2 text-[12px] text-[var(--red)]"
              >
                ✕ {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="tally-btn"
              >
                hủy <span className="tally-kbd">esc</span>
              </button>
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => void submitTransaction(true)}
                className="tally-btn"
              >
                lưu &amp; thêm tiếp <span className="tally-kbd">⌘⏎</span>
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="tally-btn tally-btn-primary"
              >
                {createMutation.isPending ? (
                  "đang lưu..."
                ) : (
                  <>
                    lưu <span className="tally-kbd">⏎</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
