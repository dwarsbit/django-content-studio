import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PiArrowRightBold } from "react-icons/pi";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * The anatomy every dashboard widget shares: a card with a header row
 * (title, muted description, an optional action on the right) and the
 * widget's rows under it, separated by hairlines.
 */
export function Widget({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-card shadow-xs overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{title}</h2>
          {description ? (
            <div className="text-xs text-muted-foreground truncate">
              {description}
            </div>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The "View all" link in a widget's header. */
export function ViewAll({ to }: { to: string }) {
  const { t } = useTranslation();

  return (
    <Button
      variant="ghost"
      size="xs"
      className="text-muted-foreground -mr-1.5 shrink-0"
      asChild
    >
      <Link to={to}>
        {t("dashboard.view_all")}
        <PiArrowRightBold />
      </Link>
    </Button>
  );
}

/** A widget's body while its data loads. */
export function WidgetLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "py-12 flex items-center justify-center border-t",
        className,
      )}
    >
      <Spinner />
    </div>
  );
}

/** A widget's body without rows. */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="py-10 px-4 text-center text-sm text-muted-foreground select-none border-t">
      {children}
    </div>
  );
}
