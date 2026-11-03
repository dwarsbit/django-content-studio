import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toNumber } from "@/lib/format-number";
import type { ModelField, SliderWidgetOptions, WidgetProps } from "@/types";

type SliderValue = number | string | null;

/** The number of decimals of a step, so 0.1 + 0.2 shows as 0.3. */
function decimalsOf(step: number): number {
  const [, decimals = ""] = String(step).split(".");
  return decimals.length;
}

/**
 * A number between min_value and max_value, picked on a slider. The
 * value shows next to it, with the suffix (a unit). An empty optional
 * field has no value until the slider is moved; Clear empties it again.
 */
export function SliderWidget({
  field,
  name,
  value,
  onChange,
  options,
  id,
  "aria-describedby": ariaDescribedBy,
}: {
  field?: ModelField;
  name?: string;
  id?: string;
  "aria-describedby"?: string;
} & WidgetProps<SliderValue, SliderWidgetOptions>) {
  const { t, i18n } = useTranslation();
  const min = options?.min_value ?? 0;
  const max = options?.max_value ?? 100;
  const step = options?.step ?? 1;
  const suffix = options?.suffix;
  const decimals = decimalsOf(step);
  const number = toNumber(value);
  const isEmpty = number === null;
  // A DecimalField's value is a string; keep it one.
  const isDecimal = field?.type === "DecimalField";

  const display = isEmpty
    ? "–"
    : new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(number);

  return (
    <div className="flex h-9 items-center gap-3">
      <Slider
        id={id}
        name={name}
        aria-describedby={ariaDescribedBy}
        aria-label={field?.verbose_name}
        min={min}
        max={max}
        step={step}
        value={[isEmpty ? min : Math.min(Math.max(number, min), max)]}
        className={isEmpty ? "opacity-60" : undefined}
        onValueChange={([next]) => {
          const rounded = Number(next.toFixed(decimals));
          onChange(isDecimal ? rounded.toFixed(decimals) : rounded);
        }}
      />
      <output
        htmlFor={id}
        className="min-w-16 text-right text-sm font-medium tabular-nums"
      >
        {display}
        {suffix && !isEmpty && (
          <span className="ml-1 text-muted-foreground">{suffix}</span>
        )}
      </output>
      {!field?.required && !isEmpty && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
        >
          {t("common.clear")}
        </Button>
      )}
    </div>
  );
}
