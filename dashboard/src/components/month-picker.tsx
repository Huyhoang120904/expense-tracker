import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatDateRangeLabel,
  formatMonthLabel,
  getCurrentMonth,
  shiftMonth,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "thg 1",
  "thg 2",
  "thg 3",
  "thg 4",
  "thg 5",
  "thg 6",
  "thg 7",
  "thg 8",
  "thg 9",
  "thg 10",
  "thg 11",
  "thg 12",
] as const;

export interface MonthPickerProps {
  month: string;
  onChange: (nextMonth: string) => void;
  className?: string;
}

export function MonthPicker({ month, onChange, className }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedYear = Number(month.slice(0, 4));
  const selectedMonthNum = Number(month.slice(5, 7));
  const [browseYear, setBrowseYear] = useState(selectedYear);
  const currentMonth = getCurrentMonth();
  const currentYear = Number(currentMonth.slice(0, 4));

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setBrowseYear(Number(month.slice(0, 4)));
    }
  }

  return (
    <div
      className={cn(
        "inline-flex h-10 min-w-0 items-stretch rounded-[2px] border border-[var(--bstrong)] bg-transparent text-[13px] text-[var(--text)]",
        className,
      )}
    >
      <button
        type="button"
        aria-label="tháng trước"
        onClick={() => onChange(shiftMonth(month, -1))}
        className="inline-flex w-8 shrink-0 items-center justify-center border-r border-[var(--border)] bg-transparent text-[var(--muted)] transition-colors hover:bg-[var(--panel2)] hover:text-[var(--text)] cursor-pointer sm:w-9"
      >
        <span aria-hidden="true">&lt;</span>
      </button>

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`chọn tháng, hiện tại là ${formatMonthLabel(month)}`}
            className="inline-flex min-w-0 items-center gap-1.5 bg-transparent px-2.5 text-[12px] whitespace-nowrap text-[var(--text)] transition-colors hover:bg-[var(--panel2)] cursor-pointer sm:gap-2 sm:px-3.5 sm:text-[13px]"
          >
            <span className="hidden text-[var(--muted)] sm:inline">khoảng</span>
            <span className="tally-num min-w-0 truncate">{formatDateRangeLabel(month)}</span>
            <span className="text-[var(--muted)]" aria-hidden="true">
              ▾
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[min(268px,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain rounded-none border border-[var(--bstrong)] bg-[var(--bg)] p-3 text-[var(--text)]"
        >
          <div className="mb-2.5 flex items-center justify-between border-b border-dashed border-[var(--border)] pb-2.5">
            <button
              type="button"
              aria-label="năm trước"
              onClick={() => setBrowseYear((y) => y - 1)}
              className="tally-btn tally-btn-sm h-7 w-7 px-0 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <span aria-hidden="true">&lt;</span>
            </button>
            <span className="tally-num text-[13px] font-semibold text-[var(--text)]">
              {browseYear}
            </span>
            <button
              type="button"
              aria-label="năm sau"
              onClick={() => setBrowseYear((y) => y + 1)}
              className="tally-btn tally-btn-sm h-7 w-7 px-0 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <span aria-hidden="true">&gt;</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_NAMES.map((label, idx) => {
              const monthNum = idx + 1;
              const value = `${browseYear}-${String(monthNum).padStart(2, "0")}`;
              const isSelected =
                browseYear === selectedYear && monthNum === selectedMonthNum;
              const isCurrent = value === currentMonth;

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    onChange(value);
                    setOpen(false);
                  }}
                  className={cn(
                    "tally-num h-8 rounded-[2px] border px-2 text-[12px] transition-colors cursor-pointer",
                    isSelected
                      ? "border-[var(--text)] bg-[var(--text)] font-semibold text-[var(--bg)]"
                      : isCurrent
                        ? "border-[var(--accent)] bg-[var(--panel)] text-[var(--text)] hover:bg-[var(--panel2)]"
                        : "border-[var(--border)] bg-transparent text-[var(--text)] hover:border-[var(--bstrong)] hover:bg-[var(--panel2)]",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {month !== currentMonth || browseYear !== currentYear ? (
            <div className="mt-2.5 border-t border-dashed border-[var(--border)] pt-2.5">
              <button
                type="button"
                className="tally-btn tally-btn-sm w-full"
                onClick={() => {
                  onChange(currentMonth);
                  setOpen(false);
                }}
              >
                tháng hiện tại
              </button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      <button
        type="button"
        aria-label="tháng sau"
        onClick={() => onChange(shiftMonth(month, 1))}
        className="inline-flex w-8 shrink-0 items-center justify-center border-l border-[var(--border)] bg-transparent text-[var(--muted)] transition-colors hover:bg-[var(--panel2)] hover:text-[var(--text)] cursor-pointer sm:w-9"
      >
        <span aria-hidden="true">&gt;</span>
      </button>
    </div>
  );
}
