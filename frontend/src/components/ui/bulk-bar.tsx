import type { ReactNode } from "react";
import { PiXBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The bulk bar: a pill floating at the foot of the page while rows are
 * selected, with the count on the left, the actions (ghost buttons)
 * and a clear button. It positions itself against the nearest
 * positioned ancestor, the page's main area.
 */
export function BulkBar({
  label,
  clearLabel,
  onClear,
  children,
  className,
}: {
  /** The count, such as "3 selected". */
  label: ReactNode;
  /** The accessible name of the clear button. */
  clearLabel: string;
  onClear(): void;
  /** The actions. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="bulk-bar"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-6",
        className,
      )}
    >
      <div className="pointer-events-auto flex items-center gap-1 flex-wrap rounded-lg border bg-popover text-popover-foreground shadow-xl pl-3 pr-1.5 py-1.5">
        <span className="select-none text-sm font-medium tabular-nums mr-2">
          {label}
        </span>
        {children}
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={clearLabel}
          onClick={onClear}
        >
          <PiXBold />
        </Button>
      </div>
    </div>
  );
}
