import * as React from "react";
import { PiDotsSixVerticalBold } from "react-icons/pi";

import { cn } from "@/lib/utils";

/**
 * The grip a row is dragged by. Disabled handles stay focusable (via
 * aria-disabled) so their title can explain why reordering is off.
 */
function DragHandle({
  className,
  disabled,
  ...props
}: React.ComponentProps<"button"> & { disabled?: boolean }) {
  return (
    <button
      type="button"
      data-slot="drag-handle"
      className={cn(
        "inline-flex items-center justify-center size-6 shrink-0 rounded-md text-muted-foreground outline-none touch-none",
        "cursor-grab active:cursor-grabbing hover:bg-foreground/5 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted-foreground",
        className,
      )}
      {...props}
      aria-disabled={disabled || undefined}
    >
      <PiDotsSixVerticalBold />
    </button>
  );
}

export { DragHandle };
