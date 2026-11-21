import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteTransaction,
  useTransactionDetail,
} from "@/hooks/use-ledger";
import type { Category } from "@/lib/api";
import { getCategoryColor } from "@/lib/category-colors";
import {
  formatLocalDate,
  formatSignedTransactionAmount,
  formatUtcDateTime,
  TRANSACTION_SOURCE_LABELS,
  TRANSACTION_TYPE_META,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TransactionDetailDialogProps {
  transactionId: string | null;
  categories: Category[];
  canWrite?: boolean;
  onDeleted?: (message: string) => void;
  onClose: () => void;
}

export function TransactionDetailDialog({
  transactionId,
  categories,
  canWrite = false,
  onDeleted,
  onClose,
}: TransactionDetailDialogProps) {
  const detailQuery = useTransactionDetail(transactionId);
  const deleteMutation = useDeleteTransaction();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setCopied(false);
    setConfirmDelete(false);
    setDeleteError(null);
  }, [transactionId]);

  const tx = detailQuery.data;
  const category =
    tx?.category_id !== null && tx?.category_id !== undefined
      ? categories.find((c) => c.id === tx.category_id)
      : undefined;

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={Boolean(transactionId)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        floatingTitle="chi tiết giao dịch"
        hideCloseButton
        className="w-[min(580px,calc(100vw-2rem))] max-w-[580px] p-0"
      >
        <DialogDescription className="sr-only">
          thông tin đầy đủ của giao dịch từ sổ giao dịch trực tiếp
        </DialogDescription>

        <div className="max-h-[90vh] overflow-y-auto px-6 pt-7 pb-6 sm:px-7">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] text-[var(--muted)]">
                thông tin trực tiếp từ sổ giao dịch
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--text)] cursor-pointer"
              >
                <span className="tally-kbd">esc</span>
                <span>đóng</span>
              </button>
            </div>

            {detailQuery.isLoading ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-24 w-full" />
                <p className="text-[12px] text-[var(--muted)]">
                  đang tải chi tiết giao dịch
                  <span className="tally-cursor">█</span>
                </p>
              </div>
            ) : detailQuery.isError ? (
              <div
                role="alert"
                className="border border-[var(--red)] border-l-[3px] bg-[var(--panel)] p-3.5 text-[12px] text-[var(--red)]"
              >
                ✕{" "}
                {detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : "không thể tải chi tiết giao dịch."}
              </div>
            ) : tx ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--border)] bg-[var(--panel)] p-4">
                  <div>
                    <div
                      className={cn(
                        "tally-big tally-num",
                        TRANSACTION_TYPE_META[tx.type].amountClass,
                      )}
                    >
                      {formatSignedTransactionAmount(
                        tx.amount_minor,
                        tx.currency_code,
                        tx.type,
                      )}
                    </div>
                    <p className="tally-num mt-1 text-[12px] text-[var(--muted)]">
                      {formatLocalDate(tx.transaction_date, "full")} ·{" "}
                      {tx.currency_code}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "tally-tag",
                        TRANSACTION_TYPE_META[tx.type].badgeClass,
                      )}
                    >
                      {TRANSACTION_TYPE_META[tx.type].label}
                    </span>
                    <span className="tally-tag">
                      {TRANSACTION_SOURCE_LABELS[tx.source]}
                    </span>
                  </div>
                </div>

                <dl className="border-t border-dashed border-[var(--border)] text-[13px]">
                  <div className="tally-row flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <dt className="text-[12px] text-[var(--muted)]">
                      nơi chi / đối tác
                    </dt>
                    <dd className="font-medium text-[var(--text)]">
                      {tx.merchant?.trim() || "—"}
                    </dd>
                  </div>

                  <div className="tally-row flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <dt className="text-[12px] text-[var(--muted)]">
                      danh mục
                    </dt>
                    <dd className="flex items-center gap-2 text-[var(--text)]">
                      {tx.category_id ? (
                        <>
                          <span
                            className="tally-sw"
                            style={{
                              backgroundColor: getCategoryColor(
                                tx.category_id,
                                category?.name,
                              ),
                            }}
                            aria-hidden="true"
                          />
                          <span className="lowercase">
                            {category?.name ?? tx.category_id}
                          </span>
                          {category?.archived ? (
                            <span className="tally-tag">đã lưu trữ</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[var(--muted)]">
                          — chưa phân loại
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="tally-row flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <dt className="text-[12px] text-[var(--muted)]">
                      nguồn ghi nhận
                    </dt>
                    <dd>
                      <span className="tally-tag">
                        {TRANSACTION_SOURCE_LABELS[tx.source]}
                      </span>
                    </dd>
                  </div>

                  <div className="tally-row flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <dt className="text-[12px] text-[var(--muted)]">
                      mã giao dịch
                    </dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <code className="max-w-[260px] truncate border border-[var(--border)] bg-[var(--panel)] px-1.5 py-0.5 text-[11px] text-[var(--text)]">
                        {tx.id}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyId(tx.id)}
                        aria-label="sao chép mã giao dịch"
                        className={cn(
                          "tally-btn tally-btn-sm h-7 px-2 text-[11px]",
                          copied &&
                            "border-[var(--green)] text-[var(--green)]",
                        )}
                      >
                        {copied ? "✓ đã chép" : "sao chép"}
                      </button>
                    </dd>
                  </div>

                  <div className="tally-row flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <dt className="text-[12px] text-[var(--muted)]">tạo lúc</dt>
                    <dd className="tally-num text-[12px] text-[var(--muted)]">
                      {formatUtcDateTime(tx.created_at)}
                    </dd>
                  </div>

                  <div className="tally-row flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <dt className="text-[12px] text-[var(--muted)]">
                      cập nhật
                    </dt>
                    <dd className="tally-num text-[12px] text-[var(--muted)]">
                      {formatUtcDateTime(tx.updated_at)}
                    </dd>
                  </div>
                </dl>

                <div>
                  <p className="mb-1.5 text-[12px] text-[var(--muted)]">
                    ghi chú
                  </p>
                  <p
                    className={cn(
                      "border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-[13px] leading-relaxed",
                      tx.note?.trim()
                        ? "text-[var(--text)]"
                        : "text-[var(--muted)]",
                    )}
                  >
                    {tx.note?.trim() || "không có ghi chú."}
                  </p>
                </div>

                {deleteError ? (
                  <div
                    role="alert"
                    className="border border-[var(--red)] border-l-[3px] bg-[var(--panel)] px-3 py-2 text-[12px] text-[var(--red)]"
                  >
                    ✕ {deleteError}
                  </div>
                ) : null}

                {canWrite ? (
                  <div className="flex flex-wrap items-center justify-between gap-2.5 border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5">
                    <span className="text-[12px] text-[var(--muted)]">
                      chế độ chủ sở hữu cục bộ
                    </span>

                    {confirmDelete ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="tally-btn tally-btn-sm"
                        >
                          hủy
                        </button>
                        <button
                          type="button"
                          disabled={deleteMutation.isPending}
                          onClick={async () => {
                            setDeleteError(null);
                            try {
                              await deleteMutation.mutateAsync(tx.id);
                              onDeleted?.("đã xóa giao dịch.");
                              onClose();
                            } catch (err) {
                              setDeleteError(
                                err instanceof Error
                                  ? err.message
                                  : "không thể xóa giao dịch.",
                              );
                            }
                          }}
                          className="tally-btn tally-btn-sm border-[var(--red)] text-[var(--red)]"
                        >
                          {deleteMutation.isPending
                            ? "đang xóa..."
                            : "✕ xác nhận xóa"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="tally-btn tally-btn-sm border-[var(--red)] text-[var(--red)]"
                      >
                        ✕ xóa giao dịch
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    role="status"
                    className="flex items-start gap-2.5 border border-[var(--bstrong)] border-l-[3px] border-l-[var(--warn)] bg-[var(--panel)] px-3.5 py-2.5 text-[12px] text-[var(--muted)]"
                  >
                    <span
                      className="shrink-0 text-[var(--warn)]"
                      aria-hidden="true"
                    >
                      ▲
                    </span>
                    <span>
                      <strong className="font-semibold text-[var(--text)]">
                        chế độ chỉ đọc
                      </strong>{" "}
                      · giao diện cục bộ chỉ hỗ trợ xem. việc chỉnh sửa và xóa
                      được thực hiện trên bảng điều khiển đã triển khai.
                    </span>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
