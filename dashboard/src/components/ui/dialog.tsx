import * as React from "react";
import { Dialog as DialogPrimitive } from "@animate-ui/react/primitives/radix-ui/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[var(--bg)]/80 backdrop-blur-[1px]",
        className,
      )}
      {...props}
    />
  );
}

export interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content> {
  floatingTitle?: React.ReactNode;
  hideCloseButton?: boolean;
}

export function DialogContent({
  className,
  children,
  floatingTitle,
  hideCloseButton = false,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[min(600px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-none border border-[var(--bstrong)] bg-[var(--bg)] p-6 pt-7 text-[var(--text)] focus:outline-none",
          className,
        )}
        {...props}
      >
        {floatingTitle ? (
          <DialogPrimitive.Title
            data-slot="dialog-floating-title"
            className="tally-pt left-[14px]"
          >
            {floatingTitle}
          </DialogPrimitive.Title>
        ) : null}
        {children}
        {!hideCloseButton ? (
          <DialogPrimitive.Close
            aria-label="đóng hộp thoại"
            className="absolute top-3.5 right-3.5 inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-transparent text-[var(--muted)] transition-colors hover:border-[var(--bstrong)] hover:bg-[var(--panel2)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1 pr-8", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-[15px] font-semibold tracking-[-0.01em] text-[var(--text)]",
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-[12px] text-[var(--muted)]", className)}
      {...props}
    />
  );
}
