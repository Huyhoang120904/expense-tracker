import * as React from "react";
import { cn } from "@/lib/utils";

export interface PaneProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  titleId?: string;
  as?: "section" | "div";
  titleClassName?: string;
  children?: React.ReactNode;
}

export function Pane({
  title,
  titleId,
  as = "section",
  className,
  titleClassName,
  children,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: PaneProps) {
  const autoId = React.useId();
  const hasTitle = title !== undefined && title !== null && title !== "";
  const resolvedTitleId = hasTitle ? (titleId ?? autoId) : titleId;
  const resolvedLabelledBy =
    ariaLabelledBy ?? (as === "section" && hasTitle ? resolvedTitleId : undefined);

  const TitleTag = as === "section" ? "h2" : "div";

  if (as === "div") {
    return (
      <div
        data-slot="pane"
        aria-labelledby={resolvedLabelledBy}
        className={cn("tally-pane", className)}
        {...(props as React.HTMLAttributes<HTMLDivElement>)}
      >
        {hasTitle ? (
          <TitleTag
            id={resolvedTitleId}
            data-slot="pane-title"
            className={cn("tally-pt", titleClassName)}
          >
            {title}
          </TitleTag>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <section
      data-slot="pane"
      aria-labelledby={resolvedLabelledBy}
      className={cn("tally-pane", className)}
      {...props}
    >
      {hasTitle ? (
        <TitleTag
          id={resolvedTitleId}
          data-slot="pane-title"
          className={cn("tally-pt", titleClassName)}
        >
          {title}
        </TitleTag>
      ) : null}
      {children}
    </section>
  );
}
