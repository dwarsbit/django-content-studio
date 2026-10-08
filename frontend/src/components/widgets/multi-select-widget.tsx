import * as R from "ramda";

import { MultiSelect } from "@/components/ui/multi-select";
import type { ModelField, WidgetProps } from "@/types";

export function MultiSelectWidget({
  field,
  value = [],
  onChange,
}: {
  field: ModelField;
} & WidgetProps<string[]>) {
  const options = R.fromPairs(field.choices ?? []);

  return (
    <MultiSelect
      hidePlaceholderWhenSelected
      options={
        field.choices?.map(([value, label]) => ({
          label,
          value,
        })) ?? []
      }
      value={value.map((value: string) => ({ value, label: options[value] }))}
      onChange={(options) => onChange(options.map(R.prop("value")))}
    />
  );
}
