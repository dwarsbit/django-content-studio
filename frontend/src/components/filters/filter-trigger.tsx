import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PiCaretDownBold, PiXBold } from "react-icons/pi";

import { cn } from "@/lib/utils";

/**
 * The button a filter opens from: the field's name while it is unset,
 * "Field is value" with an inline clear once it has a value. Radix
 * triggers render it through `asChild`, so every prop reaches the
 * button.
 */
export function FilterTrigger({
  label,
  value,
  onClear,
  className,
  ...props
}: Omit<ComponentProps<"button">, "value"> & {
  label: ReactNode;
  // The chosen value, empty or absent while the filter is unset.
  value?: ReactNode;
  onClear?(): void;
}) {
  const { t } = useTranslation();
  const active = value !== undefined && value !== null && value !== "";

  return (
    <button
      type="button"
      {...props}
      className={cn(
        "h-8 max-w-full px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium whitespace-nowrap cursor-pointer select-none",
        "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring",
        active
          ? "bg-accent border-transparent text-foreground"
          : "bg-background text-muted-foreground shadow-xs hover:text-foreground hover:bg-muted/50",
        className,
      )}
    >
      <span className="first-letter:uppercase shrink-0">{label}</span>
      {active ? (
        <>
          <span className="text-muted-foreground">
            {t("list_view.filters.is")}
          </span>
          <span className="truncate min-w-0">{value}</span>
          {onClear && (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("list_view.filters.clear", { field: label })}
              className="-mr-1 ml-0.5 size-4 shrink-0 rounded-sm inline-flex items-center justify-center hover:bg-foreground/10"
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onClear();
                }
              }}
            >
              <PiXBold className="size-3" />
            </span>
          )}
        </>
      ) : (
        <PiCaretDownBold className="size-3 opacity-60" />
      )}
    </button>
  );
}
