import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-[2px] border border-[var(--border)] bg-transparent px-2.5 py-1.5 font-mono text-[13px] text-[var(--text)] transition-colors hover:border-[var(--bstrong)] placeholder:text-[var(--muted)] focus-visible:border-[var(--blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}
