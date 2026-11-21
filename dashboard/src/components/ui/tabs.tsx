import * as React from "react";
import { Tabs as TabsPrimitive } from "@animate-ui/react/primitives/radix-ui/tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative inline-flex h-[34px] items-stretch justify-center rounded-[2px] border border-[var(--bstrong)] bg-transparent p-0 text-[var(--muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-none px-3 text-[12px] font-normal whitespace-nowrap text-[var(--muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] disabled:pointer-events-none disabled:opacity-45 data-[state=active]:bg-[var(--text)] data-[state=active]:text-[var(--bg)] cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("mt-3 focus-visible:outline-none", className)}
      {...props}
    />
  );
}
