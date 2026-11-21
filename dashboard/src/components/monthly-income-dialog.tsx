import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Pane } from "@/components/ui/pane";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useMonthlyIncomes,
  useUpdateTransaction,
} from "@/hooks/use-ledger";
import { ApiClientError, type Category, type Transaction } from "@/lib/api";
import { getCategoryColor } from "@/lib/category-colors";
import {
  formatLocalDate,
  formatMoney,
  formatMonthLabel,
  getCurrentMonth,
  getTodayLocalDate,
  parseAmountMinorInput,
  shiftMonth,
} from "@/lib/format";

export interface MonthlyIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  currencyCode: string;
  categories: Category[];
  onSuccess: (message: string) => void;
}

const SALARY_PRESETS = ["15tr", "20tr", "25tr", "30tr"] as const;

function findPrimarySalaryRow(items: Transaction[]): Transaction | null {
  const salaryRows = items.filter((tx) => tx.category_id === "salary");
  if (salaryRows.length === 0) {
    return null;
  }
  const named = salaryRows.find((tx) => {
    const m = (tx.merchant ?? "").toLowerCase();
    return m.includes("lương") || m.includes("salary");
  });
  if (named) {
    return named;
  }
  return [...salaryRows].sort((a, b) =>
    a.transaction_date.localeCompare(b.transaction_date),
  )[0]!;
}

function clampDateToMonth(month: string, dayStr: string): string {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  const maxDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const desiredDay = Math.min(Math.max(Number(dayStr) || 1, 1), maxDay);
  return `${month}-${String(desiredDay).padStart(2, "0")}`;
}

export function MonthlyIncomeDialog({
  open,
  onOpenChange,
  month,
  currencyCode,
  categories,
  onSuccess,
}: MonthlyIncomeDialogProps) {
  const previousMonth = shiftMonth(month, -1);
  const currentIncomesQuery = useMonthlyIncomes(month, open);
  const previousIncomesQuery = useMonthlyIncomes(previousMonth, open);

  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();

  const currentItems = currentIncomesQuery.data?.items ?? [];
  const previousItems = previousIncomesQuery.data?.items ?? [];

  const primarySalaryRow = useMemo(
    () => findPrimarySalaryRow(currentItems),
    [currentItems],
  );
  const prevPrimarySalaryRow = useMemo(
    () => findPrimarySalaryRow(previousItems),
    [previousItems],
  );

  const totalIncomeMinor = useMemo(
    () => currentItems.reduce((sum, tx) => sum + tx.amount_minor, 0),
    [currentItems],
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const activeCategories = useMemo(
    () => categories.filter((c) => !c.archived),
    [categories],
  );

  const [primaryAmountInput, setPrimaryAmountInput] = useState("");
  const [primaryMerchant, setPrimaryMerchant] = useState("Lương tháng");
  const [primaryDate, setPrimaryDate] = useState(`${month}-01`);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editAmountInput, setEditAmountInput] = useState("");
  const [editMerchant, setEditMerchant] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [showAddExtra, setShowAddExtra] = useState(false);
  const [extraAmountInput, setExtraAmountInput] = useState("");
  const [extraMerchant, setExtraMerchant] = useState("");
  const [extraCategoryId, setExtraCategoryId] = useState<string | null>(
    "other",
  );
  const [extraDate, setExtraDate] = useState(`${month}-01`);
  const [extraNote, setExtraNote] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setErrorMessage(null);
    setEditingRowId(null);
    setConfirmDeleteId(null);
    setShowAddExtra(false);
    setExtraAmountInput("");
    setExtraMerchant("");
    setExtraNote("");
    setExtraDate(
      month === getCurrentMonth() ? getTodayLocalDate() : `${month}-01`,
    );
    setExtraCategoryId(
      activeCategories.some((c) => c.id === "other")
        ? "other"
        : (activeCategories[0]?.id ?? null),
    );
  }, [open, month, activeCategories]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (primarySalaryRow) {
      setPrimaryAmountInput(String(primarySalaryRow.amount_minor));
      setPrimaryMerchant(primarySalaryRow.merchant?.trim() || "Lương tháng");
      setPrimaryDate(primarySalaryRow.transaction_date);
    } else {
      setPrimaryAmountInput("");
      setPrimaryMerchant("Lương tháng");
      setPrimaryDate(`${month}-01`);
    }
  }, [open, month, primarySalaryRow?.id, primarySalaryRow?.amount_minor]);

  const parsedPrimaryAmount = useMemo(
    () => parseAmountMinorInput(primaryAmountInput, currencyCode),
    [primaryAmountInput, currencyCode],
  );
  const parsedExtraAmount = useMemo(
    () => parseAmountMinorInput(extraAmountInput, currencyCode),
    [extraAmountInput, currencyCode],
  );
  const parsedEditAmount = useMemo(
    () => parseAmountMinorInput(editAmountInput, currencyCode),
    [editAmountInput, currencyCode],
  );

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  function extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof ApiClientError) {
      const fields = err.fields ? Object.values(err.fields).join(" ") : "";
      return fields || err.message;
    }
    return fallback;
  }

  async function savePrimarySalary(override?: {
    amountMinor: number;
    merchant: string;
    date: string;
  }) {
    setErrorMessage(null);
    const amountMinor = override?.amountMinor ?? parsedPrimaryAmount;
    const merchantVal =
      (override?.merchant ?? primaryMerchant).trim() || "Lương tháng";
    const dateVal = override?.date ?? primaryDate;

    if (amountMinor === null) {
      setErrorMessage(
        "vui lòng nhập mức lương hợp lệ lớn hơn 0 (ví dụ: 25tr hoặc 25.000.000).",
      );
      return;
    }
    if (!dateVal.startsWith(`${month}-`)) {
      setErrorMessage(
        `ngày nhận lương cần nằm trong ${formatMonthLabel(month)}.`,
      );
      return;
    }

    try {
      if (primarySalaryRow) {
        await updateMutation.mutateAsync({
          id: primarySalaryRow.id,
          payload: {
            amount_minor: amountMinor,
            merchant: merchantVal,
            transaction_date: dateVal,
          },
        });
        onSuccess(
          `đã cập nhật lương ${formatMonthLabel(month)}: ${formatMoney(amountMinor, currencyCode)}.`,
        );
      } else {
        await createMutation.mutateAsync({
          transaction_date: dateVal,
          type: "income",
          amount_minor: amountMinor,
          currency_code: currencyCode,
          category_id: activeCategories.some((c) => c.id === "salary")
            ? "salary"
            : null,
          merchant: merchantVal,
          note: `thu nhập chính ${formatMonthLabel(month)}`,
        });
        onSuccess(
          `đã đặt lương ${formatMonthLabel(month)}: ${formatMoney(amountMinor, currencyCode)}.`,
        );
      }
    } catch (err) {
      setErrorMessage(
        extractErrorMessage(err, "không thể lưu mức lương tháng."),
      );
    }
  }

  async function handleCopyFromPreviousMonth() {
    if (!prevPrimarySalaryRow) {
      return;
    }
    const targetDate = clampDateToMonth(
      month,
      prevPrimarySalaryRow.transaction_date.slice(8, 10),
    );
    const label = prevPrimarySalaryRow.merchant?.trim() || "Lương tháng";
    setPrimaryAmountInput(String(prevPrimarySalaryRow.amount_minor));
    setPrimaryMerchant(label);
    setPrimaryDate(targetDate);

    await savePrimarySalary({
      amountMinor: prevPrimarySalaryRow.amount_minor,
      merchant: label,
      date: targetDate,
    });
  }

  function startEditingRow(tx: Transaction) {
    setEditingRowId(tx.id);
    setEditAmountInput(String(tx.amount_minor));
    setEditMerchant(tx.merchant ?? "");
    setEditDate(tx.transaction_date);
    setEditNote(tx.note ?? "");
    setConfirmDeleteId(null);
    setErrorMessage(null);
  }

  async function handleSaveRowEdit(id: string) {
    setErrorMessage(null);
    if (parsedEditAmount === null) {
      setErrorMessage("số tiền chỉnh sửa không hợp lệ.");
      return;
    }
    if (!editDate.startsWith(`${month}-`)) {
      setErrorMessage(
        `ngày thu nhập cần nằm trong ${formatMonthLabel(month)}.`,
      );
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id,
        payload: {
          amount_minor: parsedEditAmount,
          merchant: editMerchant.trim() || null,
          transaction_date: editDate,
          note: editNote.trim() || null,
        },
      });
      setEditingRowId(null);
      onSuccess("đã cập nhật khoản thu nhập.");
    } catch (err) {
      setErrorMessage(
        extractErrorMessage(err, "không thể cập nhật khoản thu nhập."),
      );
    }
  }

  async function handleDeleteRow(id: string) {
    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync(id);
      setConfirmDeleteId(null);
      if (editingRowId === id) {
        setEditingRowId(null);
      }
      onSuccess("đã xóa khoản thu nhập.");
    } catch (err) {
      setErrorMessage(
        extractErrorMessage(err, "không thể xóa khoản thu nhập."),
      );
    }
  }

  async function handleAddExtraIncome() {
    setErrorMessage(null);
    if (parsedExtraAmount === null) {
      setErrorMessage("vui lòng nhập số tiền thu nhập hợp lệ.");
      return;
    }
    if (!extraDate.startsWith(`${month}-`)) {
      setErrorMessage(
        `ngày thu nhập cần nằm trong ${formatMonthLabel(month)}.`,
      );
      return;
    }

    try {
      await createMutation.mutateAsync({
        transaction_date: extraDate,
        type: "income",
        amount_minor: parsedExtraAmount,
        currency_code: currencyCode,
        category_id: extraCategoryId,
        merchant: extraMerchant.trim() || "Thu nhập phụ",
        note: extraNote.trim() || null,
      });
      onSuccess(
        `đã thêm khoản thu ${formatMoney(parsedExtraAmount, currencyCode)}.`,
      );
      setExtraAmountInput("");
      setExtraMerchant("");
      setExtraNote("");
      setShowAddExtra(false);
    } catch (err) {
      setErrorMessage(
        extractErrorMessage(err, "không thể thêm khoản thu nhập."),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        floatingTitle="thu nhập tháng"
        hideCloseButton
        className="w-[min(640px,calc(100vw-2rem))] max-w-[640px] p-0"
      >
        <DialogDescription className="sr-only">
          quản lý lương tháng và các khoản thu nhập khác trong {formatMonthLabel(month)}
        </DialogDescription>

        <div className="max-h-[90vh] overflow-y-auto px-6 pt-7 pb-6 sm:px-7">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-[var(--muted)]">
                quản lý lương và các nguồn thu ·{" "}
                <span className="text-[var(--text)]">
                  {formatMonthLabel(month)}
                </span>
              </p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--text)] cursor-pointer"
              >
                <span className="tally-kbd">esc</span>
                <span>đóng</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
              <div>
                <p className="text-[12px] text-[var(--muted)]">
                  tổng thu nhập hiện tại
                </p>
                <p className="tally-big tally-num mt-0.5 text-[var(--green)]">
                  {formatMoney(totalIncomeMinor, currencyCode, {
                    showPlus: totalIncomeMinor > 0,
                  })}
                </p>
              </div>

              {prevPrimarySalaryRow ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleCopyFromPreviousMonth()}
                  className="tally-btn tally-btn-sm tally-num"
                >
                  sao chép {formatMonthLabel(previousMonth)} (
                  {formatMoney(prevPrimarySalaryRow.amount_minor, currencyCode)})
                </button>
              ) : null}
            </div>

            <Pane
              title="thu nhập chính (lương tháng)"
              className="flex flex-col gap-4 bg-[var(--bg)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-[var(--muted)]">
                  trạng thái tháng này
                </span>
                {primarySalaryRow ? (
                  <span className="tally-tag border-[var(--green)] text-[var(--green)]">
                    ✓ đã thiết lập
                  </span>
                ) : (
                  <span className="tally-tag">chưa có</span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="monthly-salary-amount"
                    className="text-[12px] text-[var(--muted)]"
                  >
                    số tiền ({currencyCode})
                  </label>
                  {parsedPrimaryAmount !== null ? (
                    <span className="tally-num text-[12px] text-[var(--green)]">
                      = {formatMoney(parsedPrimaryAmount, currencyCode)}
                    </span>
                  ) : null}
                </div>

                <Input
                  id="monthly-salary-amount"
                  value={primaryAmountInput}
                  onChange={(e) => setPrimaryAmountInput(e.target.value)}
                  placeholder="ví dụ: 25tr hoặc 25.000.000"
                  className="tally-num font-semibold"
                />

                <div className="flex flex-wrap gap-2">
                  {SALARY_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={
                        primaryAmountInput.trim().toLowerCase() === preset
                      }
                      onClick={() => setPrimaryAmountInput(preset)}
                      className="tally-btn tally-btn-sm tally-num"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="monthly-salary-label"
                    className="mb-1.5 block text-[12px] text-[var(--muted)]"
                  >
                    nguồn thu
                  </label>
                  <Input
                    id="monthly-salary-label"
                    value={primaryMerchant}
                    onChange={(e) => setPrimaryMerchant(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    htmlFor="monthly-salary-date"
                    className="mb-1.5 block text-[12px] text-[var(--muted)]"
                  >
                    ngày nhận
                  </label>
                  <DateInput
                    id="monthly-salary-date"
                    value={primaryDate}
                    onChange={setPrimaryDate}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void savePrimarySalary()}
                  className="tally-btn tally-btn-primary tally-btn-sm h-9 px-3.5 text-[13px]"
                >
                  {isBusy
                    ? "đang lưu..."
                    : primarySalaryRow
                      ? "cập nhật lương tháng"
                      : "đặt lương tháng"}
                </button>
              </div>
            </Pane>

            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[12px] text-[var(--muted)]">
                  các khoản thu nhập trong tháng{" "}
                  <span className="tally-num text-[var(--text)]">
                    ({currentItems.length})
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddExtra((v) => !v)}
                  className="tally-btn tally-btn-sm"
                >
                  {showAddExtra ? "đóng biểu mẫu" : "+ thêm khoản thu khác"}
                </button>
              </div>

              {showAddExtra ? (
                <div className="flex flex-col gap-3 border border-[var(--bstrong)] bg-[var(--panel)] p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label
                          htmlFor="extra-income-amount"
                          className="text-[12px] text-[var(--muted)]"
                        >
                          số tiền
                        </label>
                        {parsedExtraAmount !== null ? (
                          <span className="tally-num text-[11px] text-[var(--green)]">
                            {formatMoney(parsedExtraAmount, currencyCode)}
                          </span>
                        ) : null}
                      </div>
                      <Input
                        id="extra-income-amount"
                        value={extraAmountInput}
                        onChange={(e) => setExtraAmountInput(e.target.value)}
                        placeholder="ví dụ: 3,5tr"
                        className="tally-num bg-[var(--bg)]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="extra-income-date"
                        className="mb-1.5 block text-[12px] text-[var(--muted)]"
                      >
                        ngày nhận
                      </label>
                      <DateInput
                        id="extra-income-date"
                        value={extraDate}
                        onChange={setExtraDate}
                        className="bg-[var(--bg)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="extra-income-merchant"
                        className="mb-1.5 block text-[12px] text-[var(--muted)]"
                      >
                        mô tả / nguồn
                      </label>
                      <Input
                        id="extra-income-merchant"
                        value={extraMerchant}
                        onChange={(e) => setExtraMerchant(e.target.value)}
                        placeholder="thưởng, freelance..."
                        className="bg-[var(--bg)]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="extra-income-category"
                        className="mb-1.5 block text-[12px] text-[var(--muted)]"
                      >
                        danh mục
                      </label>
                      <select
                        id="extra-income-category"
                        value={extraCategoryId ?? ""}
                        onChange={(e) =>
                          setExtraCategoryId(e.target.value || null)
                        }
                        className="flex h-10 w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 font-mono text-[13px] text-[var(--text)] transition-colors hover:border-[var(--bstrong)] focus-visible:border-[var(--blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
                      >
                        {activeCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name.toLowerCase()}
                          </option>
                        ))}
                        <option value="">chưa phân loại</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="extra-income-note"
                      className="mb-1.5 block text-[12px] text-[var(--muted)]"
                    >
                      ghi chú (không bắt buộc)
                    </label>
                    <Input
                      id="extra-income-note"
                      value={extraNote}
                      onChange={(e) => setExtraNote(e.target.value)}
                      placeholder="ghi chú thêm"
                      className="bg-[var(--bg)]"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddExtra(false)}
                      className="tally-btn tally-btn-sm"
                    >
                      hủy
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleAddExtraIncome()}
                      className="tally-btn tally-btn-primary tally-btn-sm"
                    >
                      thêm khoản thu
                    </button>
                  </div>
                </div>
              ) : null}

              {currentIncomesQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                </div>
              ) : currentItems.length === 0 ? (
                <p className="border border-dashed border-[var(--bstrong)] py-5 text-center text-[12px] text-[var(--muted)]">
                  ∅ chưa có khoản thu nhập nào trong {formatMonthLabel(month)}.
                </p>
              ) : (
                <div className="border-t border-dashed border-[var(--border)]">
                  {currentItems.map((tx) => {
                    const isEditing = editingRowId === tx.id;
                    const catName = tx.category_id
                      ? (categoryMap.get(tx.category_id)?.name ?? tx.category_id)
                      : "chưa phân loại";

                    if (isEditing) {
                      return (
                        <div
                          key={tx.id}
                          className="tally-row space-y-2.5 bg-[var(--panel)] p-3"
                        >
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Input
                              aria-label="số tiền chỉnh sửa"
                              value={editAmountInput}
                              onChange={(e) =>
                                setEditAmountInput(e.target.value)
                              }
                              placeholder="số tiền"
                              className="tally-num h-9 bg-[var(--bg)] text-[12px]"
                            />
                            <DateInput
                              aria-label="ngày thu nhập chỉnh sửa"
                              value={editDate}
                              onChange={setEditDate}
                              className="h-9 bg-[var(--bg)] text-[12px]"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Input
                              aria-label="nguồn thu chỉnh sửa"
                              value={editMerchant}
                              onChange={(e) => setEditMerchant(e.target.value)}
                              placeholder="nguồn thu"
                              className="h-9 bg-[var(--bg)] text-[12px]"
                            />
                            <Input
                              aria-label="ghi chú chỉnh sửa"
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              placeholder="ghi chú"
                              className="h-9 bg-[var(--bg)] text-[12px]"
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="tally-num text-[11px] text-[var(--muted)]">
                              {parsedEditAmount !== null
                                ? `= ${formatMoney(parsedEditAmount, currencyCode)}`
                                : "số tiền chưa hợp lệ"}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingRowId(null)}
                                className="tally-btn tally-btn-sm"
                              >
                                hủy
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSaveRowEdit(tx.id)}
                                className="tally-btn tally-btn-primary tally-btn-sm"
                              >
                                lưu
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={tx.id}
                        className="tally-row flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {tx.category_id ? (
                              <span
                                className="tally-sw"
                                style={{
                                  backgroundColor: getCategoryColor(
                                    tx.category_id,
                                    catName,
                                  ),
                                }}
                                aria-hidden="true"
                              />
                            ) : null}
                            <span className="truncate text-[13px] font-medium text-[var(--text)]">
                              {tx.merchant?.trim() || catName.toLowerCase()}
                            </span>
                            <span className="tally-tag lowercase">
                              {tx.category_id ? catName : "— chưa phân loại"}
                            </span>
                          </div>
                          <p className="tally-num text-[11px] text-[var(--muted)]">
                            {formatLocalDate(tx.transaction_date, "full")}
                            {tx.note ? ` · ${tx.note}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="tally-num text-[13px] font-semibold text-[var(--green)]">
                            {formatMoney(tx.amount_minor, tx.currency_code, {
                              showPlus: true,
                            })}
                          </span>

                          <button
                            type="button"
                            aria-label="sửa khoản thu nhập"
                            onClick={() => startEditingRow(tx)}
                            className="tally-btn tally-btn-sm h-7 px-2 text-[11px]"
                          >
                            sửa
                          </button>

                          {confirmDeleteId === tx.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="tally-btn tally-btn-sm h-7 px-2 text-[11px]"
                              >
                                hủy
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleDeleteRow(tx.id)}
                                className="tally-btn tally-btn-sm h-7 border-[var(--red)] px-2 text-[11px] text-[var(--red)]"
                              >
                                xác nhận xóa
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label="xóa khoản thu nhập"
                              onClick={() => setConfirmDeleteId(tx.id)}
                              className="tally-btn tally-btn-sm h-7 px-2 text-[11px] text-[var(--muted)] hover:border-[var(--red)] hover:text-[var(--red)]"
                            >
                              xóa
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {errorMessage ? (
              <div
                role="alert"
                className="border border-[var(--red)] border-l-[3px] bg-[var(--panel)] px-3 py-2 text-[12px] text-[var(--red)]"
              >
                ✕ {errorMessage}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
