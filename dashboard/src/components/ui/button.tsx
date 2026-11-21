import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-[2px] font-mono text-[13px] font-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)] font-semibold hover:brightness-[1.08]",
        secondary:
          "border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--bstrong)] hover:bg-[var(--panel2)]",
        outline:
          "border border-[var(--bstrong)] bg-transparent text-[var(--text)] hover:bg-[var(--panel2)] aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--panel)]",
        ghost:
          "border border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]",
        destructive:
          "border border-[var(--red)] bg-transparent text-[var(--red)] hover:bg-[var(--panel2)]",
      },
      size: {
        default: "h-10 px-3.5",
        sm: "h-[30px] gap-1.5 px-2.5 text-[12px]",
        lg: "h-10 px-5 text-[13px]",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      data-variant={variant ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
