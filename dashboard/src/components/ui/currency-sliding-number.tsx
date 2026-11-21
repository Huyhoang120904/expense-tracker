import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import { formatMoney, getCurrencyDisplayInfo } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CurrencySlidingNumberProps {
  amountMinor: number;
  currencyCode: string;
  showPlus?: boolean;
  className?: string;
  currencyClassName?: string;
  signClassName?: string;
}

export function CurrencySlidingNumber({
  amountMinor,
  currencyCode,
  showPlus = false,
  className,
  currencyClassName,
  signClassName,
}: CurrencySlidingNumberProps) {
  const { symbol, decimals, divisor, symbolPosition } =
    getCurrencyDisplayInfo(currencyCode);
  const absMajor = Math.abs(amountMinor) / divisor;
  const sign =
    amountMinor < 0 ? "\u2212" : amountMinor > 0 && showPlus ? "+" : "";
  const ariaLabel = formatMoney(amountMinor, currencyCode, { showPlus });

  return (
    <span
      aria-label={ariaLabel}
      className={cn("inline-flex items-baseline tabular-nums", className)}
    >
      {sign ? (
        <span aria-hidden="true" className={signClassName}>
          {sign}
        </span>
      ) : null}
      {symbolPosition === "prefix" ? (
        <span
          aria-hidden="true"
          className={cn("font-normal text-[var(--muted)]", currencyClassName)}
        >
          {symbol}
        </span>
      ) : null}
      <SlidingNumber
        number={absMajor}
        thousandSeparator="."
        decimalSeparator=","
        decimalPlaces={decimals}
        initiallyStable
      />
      {symbolPosition === "suffix" ? (
        <span
          aria-hidden="true"
          className={cn(
            "ml-[0.28em] font-normal text-[var(--muted)]",
            currencyClassName,
          )}
        >
          {symbol}
        </span>
      ) : null}
    </span>
  );
}
