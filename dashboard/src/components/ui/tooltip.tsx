import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@animate-ui/react/primitives/radix-ui/tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-xs rounded-[2px] border border-[var(--bstrong)] bg-[var(--panel)] px-2.5 py-1.5 text-[11px] leading-snug font-normal text-[var(--text)]",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-[var(--bstrong)]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
