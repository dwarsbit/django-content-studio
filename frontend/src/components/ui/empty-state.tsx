import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The empty state of a list or a grid: an icon in a mist tile, a
 * title, a line of explanation and, usually, one action: the
 * invitation to create or upload, or to clear the filters that hide
 * everything.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6 font-normal whitespace-normal",
        className,
      )}
    >
      {icon && (
        <div className="size-10 rounded-full bg-muted border flex items-center justify-center text-muted-foreground [&_svg]:size-5 [&_span]:text-xl mb-3">
          {icon}
        </div>
      )}
      {title && <div className="font-medium">{title}</div>}
      {description && (
        <div className="text-muted-foreground text-sm max-w-sm mt-1">
          {description}
        </div>
      )}
      {action && <div className="mt-4 flex items-center gap-2">{action}</div>}
    </div>
  );
}
