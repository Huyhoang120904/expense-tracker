import { useState } from "react";
import { Pane } from "@/components/ui/pane";
import { BUDGETS_STORAGE_KEY, useBudgets } from "@/hooks/use-budgets";
import {
  formatMoney,
  formatMonthShort,
  getCurrencyDisplayInfo,
} from "@/lib/format";
import { THEME_STORAGE_KEY, useTheme } from "@/lib/theme";

const TOKEN_SWATCHES = [
  "--bg",
  "--panel",
  "--accent",
  "--blue",
  "--green",
  "--warn",
  "--red",
  "--purple",
  "--cyan",
  "--pink",
] as const;

const QUICK_SHORTCUTS: ReadonlyArray<{ keys: string[]; desc: string }> = [
  { keys: ["d", "t", "b", "r", "s"], desc: "chuyển giữa 5 trang chính" },
  { keys: ["⌘K", "/"], desc: "mở bảng lệnh & tìm kiếm nhanh" },
  { keys: ["l"], desc: "chuyển nhanh giao diện sáng / tối" },
  { keys: ["n", "m"], desc: "thêm khoản chi / đặt thu nhập tháng" },
  { keys: ["v"], desc: "chuyển biểu đồ ↔ bảng tại bảng điều khiển" },
  { keys: ["?"], desc: "mở bảng hướng dẫn phím tắt" },
];

export interface SettingsViewProps {
  month: string;
  currencyCode: string;
  canWrite: boolean;
  apiState: "checking" | "online" | "offline";
  authError: boolean;
  onOpenMonthlyIncome: () => void;
  onOpenShortcuts: () => void;
  onRefresh: () => void;
  onNotify?: (message: string, tone?: "success" | "warn" | "error") => void;
}

export function SettingsView({
  month,
  currencyCode,
  canWrite,
  apiState,
  authError,
  onOpenMonthlyIncome,
  onOpenShortcuts,
  onRefresh,
  onNotify,
}: SettingsViewProps) {
  const { theme, setTheme } = useTheme();
  const { budgets, totalBudgetMinor, hasBudgets, resetBudgets } = useBudgets();
  const [confirmingReset, setConfirmingReset] = useState(false);

  const budgetCount = Object.keys(budgets).length;
  const { symbol: currencySymbol, symbolPosition } =
    getCurrencyDisplayInfo(currencyCode);
  const unsetBudgetDisplay =
    symbolPosition === "prefix" ? `${currencySymbol}–` : `– ${currencySymbol}`;

  function handleSelectTheme(nextTheme: "dark" | "light") {
    if (theme === nextTheme) {
      return;
    }
    setTheme(nextTheme);
    onNotify?.(
      nextTheme === "dark"
        ? "đã chuyển sang giao diện tối"
        : "đã chuyển sang giao diện sáng",
      "success",
    );
  }

  function handleConfirmResetBudgets() {
    resetBudgets();
    setConfirmingReset(false);
    onNotify?.("đã xóa toàn bộ hạn mức ngân sách cục bộ", "warn");
  }

  const apiStatusNode =
    apiState === "offline" ? (
      <span className="tally-st-over">✕ ngoại tuyến</span>
    ) : apiState === "checking" ? (
      <span className="tally-st-warn">▲ đang kiểm tra</span>
    ) : authError ? (
      <span className="tally-st-warn">▲ thiếu khóa đọc api</span>
    ) : (
      <span className="text-[var(--green)]">● đang hoạt động</span>
    );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <Pane title="giao diện">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px] text-[var(--muted)]">
              chế độ màu chủ đạo
            </span>
            <div
              className="tally-seg"
              role="group"
              aria-label="chọn giao diện sáng hoặc tối"
            >
              <button
                type="button"
                aria-pressed={theme === "dark"}
                onClick={() => handleSelectTheme("dark")}
                className="tally-seg-btn text-[12px]"
              >
                tối (#0a0a0a)
              </button>
              <button
                type="button"
                aria-pressed={theme === "light"}
                onClick={() => handleSelectTheme("light")}
                className="tally-seg-btn text-[12px]"
              >
                sáng (#fbfaf8)
              </button>
            </div>
          </div>

          <p className="text-[12px] text-[var(--muted)]">
            giao diện được lưu tại{" "}
            <span className="text-[var(--text)]">{THEME_STORAGE_KEY}</span> và
            áp dụng trước khi vẽ trang. bấm{" "}
            <span className="tally-kbd">l</span> bất cứ lúc nào để chuyển nhanh.
          </p>

          <div className="space-y-2 border-t border-dashed border-[var(--border)] pt-3">
            <div className="text-[12px] text-[var(--muted)]">
              bảng màu đang hoạt động ({theme === "dark" ? "tối" : "sáng"})
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TOKEN_SWATCHES.map((token) => (
                <div
                  key={token}
                  className="flex items-center gap-2 border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5"
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 border border-[var(--bstrong)]"
                    style={{ backgroundColor: `var(${token})` }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-[11px] text-[var(--muted)]">
                    {token}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Pane>

      <Pane title="kết nối & quyền truy cập">
        <div className="space-y-4">
          <ul>
            <li className="tally-row flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12px]">
              <span className="text-[var(--muted)]">trạng thái api</span>
              <span>{apiStatusNode}</span>
            </li>
            <li className="tally-row flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12px]">
              <span className="text-[var(--muted)]">chế độ hoạt động</span>
              <span className="text-[var(--text)]">
                {canWrite
                  ? "chế độ chủ sở hữu · ghi cục bộ"
                  : "chế độ chỉ đọc"}
              </span>
            </li>
            <li className="tally-row flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12px]">
              <span className="text-[var(--muted)]">định dạng & tiền tệ</span>
              <span className="tally-num text-[var(--text)]">
                vi-VN · {currencyCode}
              </span>
            </li>
            <li className="tally-row flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12px]">
              <span className="text-[var(--muted)]">tháng đang xem</span>
              <span className="tally-num text-[var(--text)]">
                {formatMonthShort(month)}
              </span>
            </li>
          </ul>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onRefresh}
              className="tally-btn tally-btn-sm"
            >
              làm mới dữ liệu
            </button>

            {canWrite ? (
              <button
                type="button"
                onClick={onOpenMonthlyIncome}
                className="tally-btn tally-btn-primary tally-btn-sm"
              >
                đặt thu nhập tháng <span className="tally-kbd">m</span>
              </button>
            ) : null}
          </div>
        </div>
      </Pane>

      <Pane title="dữ liệu cục bộ trên trình duyệt">
        <div className="space-y-4">
          <ul>
            <li className="tally-row flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12px]">
              <span className="text-[var(--muted)]">khóa ngân sách</span>
              <span className="text-[var(--text)]">{BUDGETS_STORAGE_KEY}</span>
            </li>
            <li className="tally-row flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12px]">
              <span className="text-[var(--muted)]">
                danh mục đã đặt hạn mức
              </span>
              <span className="tally-num text-[var(--text)]">
                {budgetCount} danh mục
              </span>
            </li>
            <li className="tally-row flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12px]">
              <span className="text-[var(--muted)]">
                tổng hạn mức hàng tháng
              </span>
              <span className="tally-num text-[var(--text)]">
                {hasBudgets
                  ? formatMoney(totalBudgetMinor, currencyCode)
                  : unsetBudgetDisplay}
              </span>
            </li>
          </ul>

          <p className="text-[12px] text-[var(--muted)]">
            hạn mức ngân sách chỉ lưu trong localStorage trên trình duyệt hiện
            tại, không gửi ra ngoài và không ảnh hưởng tới giao dịch backend.
          </p>

          {confirmingReset ? (
            <div
              role="alert"
              className="space-y-3 border border-[var(--red)] bg-[var(--panel)] p-3.5"
            >
              <p className="tally-st-over text-[12px]">
                ✕ xác nhận xóa toàn bộ {budgetCount} hạn mức ngân sách đã cấu
                hình? thao tác này không thể hoàn tác.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmResetBudgets}
                  className="tally-btn tally-btn-sm border-[var(--red)] text-[var(--red)]"
                >
                  xác nhận xóa
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="tally-btn tally-btn-sm"
                >
                  hủy
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!hasBudgets}
              onClick={() => setConfirmingReset(true)}
              className="tally-btn tally-btn-sm border-[var(--red)] text-[var(--red)]"
            >
              xóa toàn bộ hạn mức ngân sách
            </button>
          )}
        </div>
      </Pane>

      <Pane title="phím tắt nhanh">
        <div className="space-y-4">
          <ul>
            {QUICK_SHORTCUTS.map((item) => (
              <li
                key={item.desc}
                className="tally-row flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]"
              >
                <span className="text-[var(--muted)]">{item.desc}</span>
                <span className="flex items-center gap-1">
                  {item.keys.map((key) => (
                    <span key={key} className="tally-kbd">
                      {key}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>

          <div>
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="tally-btn tally-btn-sm"
            >
              mở bảng phím tắt <span className="tally-kbd">?</span>
            </button>
          </div>
        </div>
      </Pane>
    </div>
  );
}
