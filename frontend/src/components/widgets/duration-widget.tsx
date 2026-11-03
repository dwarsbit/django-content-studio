import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import {
  type DurationParts,
  EMPTY_DURATION,
  formatDuration,
  parseDuration,
} from "@/lib/duration";
import type { DurationWidgetOptions, WidgetProps } from "@/types";

type Unit = keyof DurationParts;

/**
 * A DurationField as boxes for hours, minutes and seconds (and days
 * with show_days). Empty boxes count as 0; all empty is no duration.
 * Without a days box, a day counts as 24 hours.
 */
export function DurationWidget({
  value,
  onChange,
  options = {},
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
} & WidgetProps<string | null, DurationWidgetOptions>) {
  const { t } = useTranslation();
  const showDays = !!options.show_days;
  const showSeconds = options.show_seconds ?? true;
  const fromValue = () => parseDuration(value, showDays) ?? EMPTY_DURATION;

  // The boxes keep what the editor typed ("5", not "05"); a value from
  // elsewhere (a reset, a loaded object) replaces them.
  const [parts, setParts] = useState<DurationParts>(fromValue);
  const [emitted, setEmitted] = useState<string | null | undefined>(value);

  if (value !== emitted) {
    setEmitted(value);
    setParts(fromValue());
  }

  const units: Unit[] = [
    ...(showDays ? (["days"] as const) : []),
    "hours",
    "minutes",
    ...(showSeconds ? (["seconds"] as const) : []),
  ];

  const change = (unit: Unit, input: string) => {
    const next = { ...parts, [unit]: input.replace(/\D/g, "") };
    const duration = formatDuration(next, units);

    setParts(next);
    setEmitted(duration);
    onChange(duration);
  };

  return (
    <div
      role="group"
      id={id}
      aria-describedby={ariaDescribedBy}
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      {units.map((unit) => (
        <label key={unit} className="flex items-center gap-1.5">
          <Input
            value={parts[unit]}
            inputMode="numeric"
            maxLength={unit === "minutes" || unit === "seconds" ? 2 : undefined}
            aria-invalid={ariaInvalid}
            className="w-16 tabular-nums"
            placeholder={unit === "days" || unit === "hours" ? "0" : "00"}
            onFocus={(e) => e.target.select()}
            onChange={(e) => change(unit, e.target.value)}
          />
          <span className="text-sm text-muted-foreground select-none">
            {t(`widgets.duration_widget.${unit}`)}
          </span>
        </label>
      ))}
    </div>
  );
}
