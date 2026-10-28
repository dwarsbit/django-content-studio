import type { ReactNode } from "react";
import { Link } from "react-router";

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

/**
 * Scope tabs under the page title: the places a list can be, such as
 * the list itself and its trash. Navigation, not an action.
 */
export function HeaderTabs({
  tabs,
  current,
}: {
  tabs: { label: ReactNode; count?: number; to: string }[];
  current: string;
}) {
  return (
    <nav className="border-b">
      <div className="px-6 flex items-center gap-5 max-w-[1280px] mx-auto w-full">
        {tabs.map((tab) => {
          const active = tab.to === current;

          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 -mb-px border-b-2 px-0.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring rounded-t-sm",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="first-letter:uppercase">{tab.label}</span>
              {tab.count != null && (
                <span className="rounded-sm bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
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
