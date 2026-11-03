import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ModelField, WidgetProps } from "@/types";

/**
 * The field's choices as radio buttons, one per line. An optional
 * field with a value can be cleared.
 */
export function RadioButtonWidget({
  field,
  value,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  field: ModelField;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
} & WidgetProps<unknown>) {
  const { t } = useTranslation();
  const prefix = useId();
  const choices = field.choices ?? [];
  const isEmpty = value === null || value === undefined || value === "";

  return (
    <div className="flex flex-col items-start gap-2">
      <RadioGroup
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        value={isEmpty ? "" : String(value)}
        // Radix works with strings; the choice keeps its own value (an
        // integer choice stays an integer).
        onValueChange={(next) =>
          onChange?.(choices.find(([key]) => String(key) === next)?.[0] ?? next)
        }
      >
        {choices.map(([key, label]) => (
          <div key={String(key)} className="flex items-center gap-2">
            <RadioGroupItem value={String(key)} id={`${prefix}-${key}`} />
            <Label htmlFor={`${prefix}-${key}`} className="font-normal">
              {label}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {!field.required && !isEmpty && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-muted-foreground"
          onClick={() => onChange?.(null)}
        >
          {t("common.clear")}
        </Button>
      )}
    </div>
  );
}
