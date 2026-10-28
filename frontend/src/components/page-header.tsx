import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The page header: one 56px bar on every page, with the title on the
 * left and the page's actions on the right. Pages add rows under it
 * (scope tabs, a toolbar) through `children`.
 */
export function PageHeader({
  back,
  icon,
  title,
  meta,
  description,
  actions,
  heading = "h1",
  children,
}: {
  back?: ReactNode;
  // The page's icon, in a mist tile: an icon component or a Phosphor
  // font class on a span.
  icon?: ReactNode;
  title: ReactNode;
  // Inline after the title: a count, a status badge.
  meta?: ReactNode;
  // A second line under the title, for a studio's list description.
  description?: ReactNode;
  actions?: ReactNode;
  // The title's element: a dialog carries its own DialogTitle.
  heading?: "h1" | "div";
  children?: ReactNode;
}) {
  const Heading = heading;

  return (
    <header className="shrink-0 border-b bg-background z-10">
      <div
        className={cn(
          "px-6 flex items-center gap-3 max-w-[1280px] mx-auto w-full",
          description ? "min-h-14 py-2" : "h-14",
        )}
      >
        {back}
        {icon && (
          <span className="size-7 shrink-0 rounded-md border bg-muted text-muted-foreground flex items-center justify-center [&_svg]:size-4 [&_span]:text-base">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <Heading className="text-base font-semibold truncate first-letter:uppercase">
              {title}
            </Heading>
            {meta}
          </div>
          {description && (
            <div className="text-muted-foreground text-sm truncate">
              {description}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {children}
    </header>
  );
}

/** A toolbar row under the page header: search, filters, view toggles. */
export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b bg-background", className)}>
      <div className="px-6 py-2.5 flex items-center gap-2 flex-wrap max-w-[1280px] mx-auto w-full">
        {children}
      </div>
    </div>
  );
}

/** The scrolling page body, capped at the content width. */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar">
      <div className={cn("mx-auto w-full max-w-[1280px] px-6 py-6", className)}>
        {children}
      </div>
    </div>
  );
}
