import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
}

interface ShortcutRow {
  label: string;
  keys: readonly string[];
  requiresWrite?: boolean;
}

const NAVIGATION_SHORTCUTS: readonly ShortcutRow[] = [
  { label: "bảng điều khiển", keys: ["d"] },
  { label: "giao dịch", keys: ["t"] },
  { label: "ngân sách", keys: ["b"] },
  { label: "báo cáo", keys: ["r"] },
  { label: "cài đặt", keys: ["s"] },
];

const ACTION_SHORTCUTS: readonly ShortcutRow[] = [
  { label: "tìm kiếm & lệnh", keys: ["⌘K", "/"] },
  { label: "đổi sáng / tối", keys: ["l"] },
  { label: "thêm khoản chi", keys: ["n"], requiresWrite: true },
  { label: "thu nhập tháng", keys: ["m"], requiresWrite: true },
  { label: "chuyển bảng / biểu đồ", keys: ["v"] },
  { label: "hiển thị phím tắt", keys: ["?"] },
];

const MODAL_SHORTCUTS: readonly ShortcutRow[] = [
  { label: "chọn nhanh danh mục", keys: ["1–7"] },
  { label: "lưu giao dịch", keys: ["⏎"] },
  { label: "lưu & thêm tiếp", keys: ["⌘⏎"] },
  { label: "đóng hộp thoại", keys: ["esc"] },
];

function ShortcutSection({
  title,
  rows,
  canWrite,
}: {
  title: string;
  rows: readonly ShortcutRow[];
  canWrite: boolean;
}) {
  return (
    <section className="flex flex-col">
      <h3 className="mb-1.5 text-[12px] text-[var(--muted)]">{title}</h3>
      <ul className="border-t border-dashed border-[var(--border)]">
        {rows.map((row) => {
          const disabledByMode = Boolean(row.requiresWrite && !canWrite);
          return (
            <li
              key={row.label}
              className={cn(
                "tally-row flex items-center justify-between gap-3 py-2 text-[13px]",
                disabledByMode && "opacity-55",
              )}
            >
              <span className="flex min-w-0 items-center gap-2 text-[var(--text)]">
                <span className="truncate">{row.label}</span>
                {disabledByMode ? (
                  <span className="tally-tag">chỉ đọc</span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {row.keys.map((key, idx) => (
                  <span key={key} className="inline-flex items-center gap-1">
                    {idx > 0 ? (
                      <span className="text-[11px] text-[var(--muted)]">/</span>
                    ) : null}
                    <span className="tally-kbd">{key}</span>
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
  canWrite,
}: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        floatingTitle="phím tắt"
        hideCloseButton
        className="w-[min(680px,calc(100vw-2rem))] max-w-[680px] p-0"
      >
        <DialogDescription className="sr-only">
          danh sách các phím tắt điều hướng, thao tác nhanh và hộp thoại
        </DialogDescription>

        <div className="max-h-[90vh] overflow-y-auto px-6 pt-7 pb-6 sm:px-7">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] text-[var(--muted)]">
                phím tắt tự tạm dừng khi con trỏ nằm trong ô nhập liệu
              </span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--text)] cursor-pointer"
              >
                <span className="tally-kbd">esc</span>
                <span>đóng</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-5">
                <ShortcutSection
                  title="điều hướng"
                  rows={NAVIGATION_SHORTCUTS}
                  canWrite={canWrite}
                />
                <ShortcutSection
                  title="trong hộp thoại"
                  rows={MODAL_SHORTCUTS}
                  canWrite={canWrite}
                />
              </div>

              <ShortcutSection
                title="thao tác"
                rows={ACTION_SHORTCUTS}
                canWrite={canWrite}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3.5 text-[12px] text-[var(--muted)]">
              <span>
                {canWrite ? (
                  <>
                    <span className="text-[var(--green)]" aria-hidden="true">
                      ●
                    </span>{" "}
                    chế độ chủ sở hữu · tất cả phím tắt đang hoạt động
                  </>
                ) : (
                  <>
                    <span className="text-[var(--warn)]" aria-hidden="true">
                      ▲
                    </span>{" "}
                    chế độ chỉ đọc · phím ghi tạm khóa
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="tally-btn tally-btn-sm"
              >
                đóng <span className="tally-kbd">esc</span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
