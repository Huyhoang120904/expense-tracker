import * as React from "react";
import { cn } from "@/lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
  dashed = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
  dashed?: boolean;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0",
        dashed
          ? orientation === "horizontal"
            ? "h-0 w-full border-t border-dashed border-[var(--border)]"
            : "h-full w-0 border-l border-dashed border-[var(--border)]"
          : orientation === "horizontal"
            ? "h-px w-full bg-[var(--border)]"
            : "h-full w-px bg-[var(--border)]",
        className,
      )}
      {...props}
    />
  );
}
