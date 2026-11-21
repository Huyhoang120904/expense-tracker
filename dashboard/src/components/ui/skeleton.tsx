import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn("tally-sk rounded-none bg-[var(--panel2)]", className)}
      {...props}
    />
  );
}
