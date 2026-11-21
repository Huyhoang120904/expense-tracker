import type { TransactionSource, TransactionType } from "./api";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "HUF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "TWD",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const SUFFIX_CURRENCIES = new Set(["VND"]);

const UNICODE_MINUS = "\u2212";
const EN_DASH = "\u2013";

export interface CurrencyDisplayInfo {
  symbol: string;
  decimals: number;
  divisor: number;
  symbolPosition: "prefix" | "suffix";
}

export function getCurrencyDisplayInfo(
  currencyCode: string,
): CurrencyDisplayInfo {
  const normalized = currencyCode.toUpperCase();
  const fallbackDecimals = ZERO_DECIMAL_CURRENCIES.has(normalized) ? 0 : 2;
  const symbolPosition = SUFFIX_CURRENCIES.has(normalized) ? "suffix" : "prefix";

  if (normalized === "VND") {
    return {
      symbol: "₫",
      decimals: 0,
      divisor: 1,
      symbolPosition: "suffix",
    };
  }

  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalized,
      currencyDisplay: "narrowSymbol",
    });
    const resolved = formatter.resolvedOptions();
    const decimals = ZERO_DECIMAL_CURRENCIES.has(normalized)
      ? 0
      : (resolved.maximumFractionDigits ?? fallbackDecimals);
    const symbolPart = formatter
      .formatToParts(0)
      .find((part) => part.type === "currency");

    return {
      symbol: symbolPart?.value ?? normalized,
      decimals,
      divisor: 10 ** decimals,
      symbolPosition,
    };
  } catch {
    return {
      symbol: normalized,
      decimals: fallbackDecimals,
      divisor: 10 ** fallbackDecimals,
      symbolPosition,
    };
  }
}

export function formatAmountNumber(
  amountMinor: number,
  currencyCode: string,
  options?: { signed?: boolean; showPlus?: boolean },
): string {
  const { decimals, divisor } = getCurrencyDisplayInfo(currencyCode);
  const absMajor = Math.abs(amountMinor) / divisor;
  const formattedNumber = new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(absMajor);

  if (options?.signed && amountMinor < 0) {
    return `${UNICODE_MINUS}${formattedNumber}`;
  }
  if (amountMinor > 0 && options?.showPlus) {
    return `+${formattedNumber}`;
  }
  return formattedNumber;
}

export function formatMoney(
  amountMinor: number,
  currencyCode: string,
  options?: { showPlus?: boolean },
): string {
  const { symbol, symbolPosition } = getCurrencyDisplayInfo(currencyCode);
  const formattedNumber = formatAmountNumber(amountMinor, currencyCode);
  const sign =
    amountMinor < 0
      ? UNICODE_MINUS
      : amountMinor > 0 && options?.showPlus
        ? "+"
        : "";

  if (symbolPosition === "suffix") {
    return `${sign}${formattedNumber} ${symbol}`;
  }
  return `${sign}${symbol}${formattedNumber}`;
}

export function formatCompactVnd(
  amountMinor: number,
  currencyCode = "VND",
): string {
  const { divisor } = getCurrencyDisplayInfo(currencyCode);
  const absMajor = Math.abs(amountMinor) / divisor;
  if (absMajor === 0) {
    return "0";
  }

  const sign = amountMinor < 0 ? UNICODE_MINUS : "";

  if (absMajor >= 1_000_000_000) {
    const billions = absMajor / 1_000_000_000;
    const formatted = new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 2,
    }).format(billions);
    return `${sign}${formatted}B`;
  }

  if (absMajor >= 1_000_000) {
    const millions = absMajor / 1_000_000;
    const formatted = new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 2,
    }).format(millions);
    return `${sign}${formatted}M`;
  }

  if (absMajor >= 1_000) {
    const thousands = absMajor / 1_000;
    const formatted = new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: absMajor >= 100_000 ? 0 : 1,
    }).format(thousands);
    return `${sign}${formatted}k`;
  }

  const formatted = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(absMajor);
  return `${sign}${formatted}`;
}

export function formatPercentVi(
  ratio: number,
  decimals = 1,
  options?: { showSign?: boolean },
): string {
  const rawPct = ratio * 100;
  const safePct = Number.isFinite(rawPct) ? rawPct : 0;
  const threshold = 10 ** -(decimals + 1);
  const isNearZero = Math.abs(safePct) < threshold;
  const absPct = isNearZero ? 0 : Math.abs(safePct);

  const formatted = new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(absPct);

  if (!isNearZero && safePct < 0) {
    return `${UNICODE_MINUS}${formatted}%`;
  }
  if (!isNearZero && safePct > 0 && options?.showSign) {
    return `+${formatted}%`;
  }
  return `${formatted}%`;
}

export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const shifted = new Date(Date.UTC(year, monthIndex + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  if (!year || !monthNum) {
    return month;
  }
  return `tháng ${monthNum}, ${year}`;
}

export function formatMonthShort(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  if (!year || !monthNum) {
    return month;
  }
  return `tháng ${monthNum}/${year}`;
}

export function formatMonthNameLower(month: string): string {
  const monthNum = Number(month.slice(5, 7));
  if (!monthNum) {
    return month;
  }
  return `tháng ${monthNum}`;
}

export function getDaysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
    return 30;
  }
  return new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
}

export interface MonthElapsedInfo {
  elapsed: number;
  total: number;
  remainingDays: number;
  pct: number;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
}

export function getMonthElapsedDays(month: string): MonthElapsedInfo {
  const total = getDaysInMonth(month);
  const currentMonth = getCurrentMonth();

  if (month === currentMonth) {
    const todayDay = new Date().getDate();
    const elapsed = Math.min(total, Math.max(1, todayDay));
    const remainingDays = Math.max(0, total - elapsed);
    const pct = Math.round((elapsed / total) * 100);
    return {
      elapsed,
      total,
      remainingDays,
      pct,
      isCurrent: true,
      isPast: false,
      isFuture: false,
    };
  }

  if (month < currentMonth) {
    return {
      elapsed: total,
      total,
      remainingDays: 0,
      pct: 100,
      isCurrent: false,
      isPast: true,
      isFuture: false,
    };
  }

  return {
    elapsed: 0,
    total,
    remainingDays: total,
    pct: 0,
    isCurrent: false,
    isPast: false,
    isFuture: true,
  };
}

export function formatDateRangeLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
    return month;
  }
  const mm = String(monthNum).padStart(2, "0");
  const { elapsed, total, isCurrent } = getMonthElapsedDays(month);
  const endDay = String(isCurrent ? elapsed : total).padStart(2, "0");
  return `01/${mm} ${EN_DASH} ${endDay}/${mm}/${year}`;
}

function parseIsoDateParts(
  dateStr: string,
): {
  year: number;
  month: number;
  day: number;
  dd: string;
  mm: string;
  yyyy: string;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    year,
    month,
    day,
    yyyy: match[1]!,
    mm: match[2]!,
    dd: match[3]!,
  };
}

export function formatLocalDate(
  dateStr: string,
  style: "short" | "full" = "full",
): string {
  const parts = parseIsoDateParts(dateStr);
  if (!parts) {
    return dateStr;
  }
  if (style === "short") {
    return `${parts.dd}/${parts.mm}`;
  }
  return `${parts.dd}/${parts.mm}/${parts.yyyy}`;
}

export function parseLocalDateInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const yyyy = isoMatch[1]!;
    const mm = isoMatch[2]!.padStart(2, "0");
    const dd = isoMatch[3]!.padStart(2, "0");
    const candidate = `${yyyy}-${mm}-${dd}`;
    return parseIsoDateParts(candidate) ? candidate : null;
  }

  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const dd = dmyMatch[1]!.padStart(2, "0");
    const mm = dmyMatch[2]!.padStart(2, "0");
    const yyyy = dmyMatch[3]!;
    const candidate = `${yyyy}-${mm}-${dd}`;
    return parseIsoDateParts(candidate) ? candidate : null;
  }

  return null;
}

export function formatUtcDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = String(parsed.getFullYear()).padStart(4, "0");
  const hh = String(parsed.getHours()).padStart(2, "0");
  const min = String(parsed.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export const TRANSACTION_TYPE_META: Record<
  TransactionType,
  {
    label: string;
    badgeClass: string;
    amountClass: string;
    sign: -1 | 1 | 0;
  }
> = {
  expense: {
    label: "chi tiêu",
    badgeClass:
      "border-[var(--bstrong)] bg-[var(--panel)] text-[var(--accent)]",
    amountClass: "text-[var(--text)]",
    sign: -1,
  },
  income: {
    label: "thu nhập",
    badgeClass: "border-[var(--green)] bg-[var(--panel)] text-[var(--green)]",
    amountClass: "text-[var(--green)]",
    sign: 1,
  },
  refund: {
    label: "hoàn tiền",
    badgeClass: "border-[var(--bstrong)] bg-[var(--panel)] text-[var(--green)]",
    amountClass: "text-[var(--green)]",
    sign: 1,
  },
  transfer: {
    label: "chuyển khoản",
    badgeClass: "border-[var(--bstrong)] bg-[var(--panel)] text-[var(--muted)]",
    amountClass: "text-[var(--muted)]",
    sign: 0,
  },
};

export const TRANSACTION_SOURCE_LABELS: Record<TransactionSource, string> = {
  dashboard: "bảng điều khiển",
  telegram: "telegram",
  agent: "tác nhân",
};

export function formatSignedTransactionAmount(
  amountMinor: number,
  currencyCode: string,
  type: TransactionType,
): string {
  const meta = TRANSACTION_TYPE_META[type];
  if (meta.sign < 0) {
    return formatMoney(-amountMinor, currencyCode);
  }
  if (meta.sign > 0) {
    return formatMoney(amountMinor, currencyCode, { showPlus: true });
  }
  return formatMoney(amountMinor, currencyCode);
}

export function getTodayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getYesterdayLocalDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseAmountMinorInput(
  raw: string,
  currencyCode: string,
): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith("-")) {
    return null;
  }

  const cleaned = trimmed
    .replace(/[\s₫đ$]/g, "")
    .replace(/vnd$/i, "");
  if (!cleaned) {
    return null;
  }

  const { decimals, divisor } = getCurrencyDisplayInfo(currencyCode);

  const suffixMatch = /^(.*?)(nghìn|nghin|triệu|trieu|tr|k|m)$/.exec(cleaned);
  if (suffixMatch) {
    const numberPart = suffixMatch[1] ?? "";
    const unit = suffixMatch[2]!;
    if (!/^\d+(?:[.,]\d+)?$/.test(numberPart)) {
      return null;
    }
    const baseNumber = Number(numberPart.replace(",", "."));
    if (!Number.isFinite(baseNumber) || baseNumber <= 0) {
      return null;
    }
    const multiplier =
      unit === "k" || unit === "nghin" || unit === "nghìn"
        ? 1_000
        : 1_000_000;
    const minor = Math.round(baseNumber * multiplier * divisor);
    return Number.isSafeInteger(minor) && minor >= 1 ? minor : null;
  }

  if (decimals === 0) {
    if (!/^\d+$/.test(cleaned) && !/^\d{1,3}(?:[.,]\d{3})+$/.test(cleaned)) {
      return null;
    }
    const minor = Number(cleaned.replace(/[.,]/g, ""));
    return Number.isSafeInteger(minor) && minor >= 1 ? minor : null;
  }

  let normalizedDecimal: string;
  if (/^\d+(?:[.,]\d{1,2})?$/.test(cleaned)) {
    normalizedDecimal = cleaned.replace(",", ".");
  } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(cleaned)) {
    normalizedDecimal = cleaned.replace(/,/g, "");
  } else {
    return null;
  }

  const major = Number(normalizedDecimal);
  if (!Number.isFinite(major) || major <= 0) {
    return null;
  }
  const minor = Math.round(major * divisor);
  return Number.isSafeInteger(minor) && minor >= 1 ? minor : null;
}
