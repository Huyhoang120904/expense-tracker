import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0 text-[11px] leading-[18px] font-normal transition-colors whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)] font-semibold",
        secondary:
          "border-[var(--border)] bg-[var(--panel)] text-[var(--text)]",
        outline:
          "border-[var(--bstrong)] bg-transparent text-[var(--muted)]",
        mint: "border-[var(--green)] bg-[var(--panel)] text-[var(--green)]",
        peach: "border-[var(--accent)] bg-[var(--panel)] text-[var(--accent)]",
        lavender:
          "border-[var(--purple)] bg-[var(--panel)] text-[var(--purple)]",
        warn: "border-[var(--warn)] bg-[var(--panel)] text-[var(--warn)]",
        destructive:
          "border-[var(--red)] bg-[var(--panel)] text-[var(--red)]",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
