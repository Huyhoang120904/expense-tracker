import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { formatLocalDate, parseLocalDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DateInputProps {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

export function DateInput({
  id,
  value,
  onChange,
  disabled = false,
  required,
  className,
  inputClassName,
  placeholder = "dd/mm/yyyy",
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: DateInputProps) {
  const [draft, setDraft] = useState<string>(() =>
    value ? formatLocalDate(value, "full") : "",
  );
  const isFocusedRef = useRef(false);
  const lastEmittedRef = useRef<string | null>(null);
  const nativePickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isFocusedRef.current && value === lastEmittedRef.current) {
      return;
    }
    setDraft(value ? formatLocalDate(value, "full") : "");
  }, [value]);

  function openNativePicker() {
    const picker = nativePickerRef.current;
    if (!picker || disabled) {
      return;
    }
    try {
      if (typeof picker.showPicker === "function") {
        picker.showPicker();
        return;
      }
    } catch {
      // Fallback below when showPicker is unavailable or blocked
    }
    picker.focus();
    picker.click();
  }

  return (
    <div
      className={cn(
        "relative flex h-10 w-full items-center rounded-[2px] border border-[var(--border)] bg-transparent font-mono text-[13px] text-[var(--text)] transition-colors hover:border-[var(--bstrong)] focus-within:border-[var(--blue)] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[var(--blue)]",
        disabled && "cursor-not-allowed opacity-45",
        className,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onChange={(e) => {
          const nextDraft = e.target.value;
          setDraft(nextDraft);
          const parsed = parseLocalDateInput(nextDraft);
          if (parsed) {
            lastEmittedRef.current = parsed;
            onChange(parsed);
          }
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          lastEmittedRef.current = null;
          const parsed = parseLocalDateInput(draft);
          if (parsed) {
            setDraft(formatLocalDate(parsed, "full"));
            if (parsed !== value) {
              onChange(parsed);
            }
          } else {
            setDraft(value ? formatLocalDate(value, "full") : "");
          }
        }}
        className={cn(
          "tally-num h-full min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-inherit outline-none focus-visible:outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed",
          inputClassName,
        )}
      />

      <input
        ref={nativePickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
        onChange={(e) => {
          const nextIso = e.target.value;
          if (!nextIso) {
            return;
          }
          lastEmittedRef.current = null;
          setDraft(formatLocalDate(nextIso, "full"));
          onChange(nextIso);
        }}
        className="pointer-events-none absolute right-2 bottom-0 h-0 w-0 opacity-0"
      />

      <button
        type="button"
        disabled={disabled}
        onClick={openNativePicker}
        aria-label="mở lịch chọn ngày"
        title="mở lịch chọn ngày"
        className="mr-1.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[var(--muted)] transition-colors hover:bg-[var(--panel2)] hover:text-[var(--text)] disabled:cursor-not-allowed"
      >
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
