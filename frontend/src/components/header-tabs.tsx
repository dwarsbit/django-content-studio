import type { ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

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
