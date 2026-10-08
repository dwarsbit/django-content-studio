import * as R from "ramda";

import { MultiSelect } from "@/components/ui/multi-select";
import type { ModelField } from "@/types";

export function TagWidget({
  value = [],
  onChange,
}: {
  field: ModelField;
  onChange(value: string[]): void;
  value?: string[];
}) {
  const _value = !value ? [] : !Array.isArray(value) ? [value] : value;

  return (
    <MultiSelect
      hidePlaceholderWhenSelected
      creatable
      value={_value.map((value) => ({ value, label: value }))}
      onChange={(value) => {
        onChange(value.map(R.prop("value")));
      }}
    />
  );
}
