import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiStarBold, PiStarFill } from "react-icons/pi";

import { toNumber } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import type { ModelField, RatingWidgetOptions, WidgetProps } from "@/types";

/**
 * A small integer as stars, from 1 to options.max_value (5 by
 * default). Arrow keys move the rating; clicking the current star
 * again clears an optional field.
 */
export function RatingWidget({
  field,
  value,
  onChange,
  options,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  field?: ModelField;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
} & WidgetProps<number | null, RatingWidgetOptions>) {
  const { t } = useTranslation();
  const max = options?.max_value ?? 5;
  const rating = toNumber(value);
  const [hovered, setHovered] = useState<number | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const shown = hovered ?? rating ?? 0;
  // The star that takes focus: the rating's, or the first.
  const focusable = rating && rating >= 1 ? Math.min(rating, max) : 1;

  function set(next: number | null) {
    onChange(next);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    };
    let next: number | null = null;

    if (event.key in steps) {
      next = Math.min(Math.max((rating ?? 0) + steps[event.key], 1), max);
    } else if (event.key === "Home") {
      next = 1;
    } else if (event.key === "End") {
      next = max;
    } else if (
      (event.key === "Delete" || event.key === "Backspace") &&
      !field?.required
    ) {
      event.preventDefault();
      set(null);
      return;
    }

    if (next !== null) {
      event.preventDefault();
      set(next);
      groupRef.current
        ?.querySelector<HTMLButtonElement>(`[data-star="${next}"]`)
        ?.focus();
    }
  }

  return (
    <div
      ref={groupRef}
      id={id}
      role="radiogroup"
      aria-label={field?.verbose_name}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      className="flex h-9 items-center gap-0.5"
      onMouseLeave={() => setHovered(null)}
      onKeyDown={onKeyDown}
    >
      {Array.from({ length: max }, (_, index) => {
        const star = index + 1;
        const filled = star <= shown;
        const Icon = filled ? PiStarFill : PiStarBold;

        return (
          <button
            key={star}
            type="button"
            role="radio"
            data-star={star}
            aria-checked={star === rating}
            aria-label={t("widgets.rating_widget.star", {
              count: star,
              max,
            })}
            tabIndex={star === focusable ? 0 : -1}
            onMouseEnter={() => setHovered(star)}
            onClick={() =>
              set(star === rating && !field?.required ? null : star)
            }
            className={cn(
              "rounded-sm p-0.5 text-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filled ? "text-amber-500" : "text-muted-foreground/50",
            )}
          >
            <Icon />
          </button>
        );
      })}
      <span className="ml-2 text-sm tabular-nums text-muted-foreground">
        {rating ? `${rating}/${max}` : ""}
      </span>
    </div>
  );
}
