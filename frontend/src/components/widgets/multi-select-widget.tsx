import * as R from "ramda";
import { useTranslation } from "react-i18next";

import { MultiSelect } from "@/components/ui/multi-select";
import type { ModelField, WidgetProps } from "@/types";

export function MultiSelectWidget({
  field,
  value = [],
  onChange,
}: {
  field: ModelField;
} & WidgetProps<string[]>) {
  const { t } = useTranslation();
  const options = R.fromPairs(field.choices ?? []);

  return (
    <MultiSelect
      hidePlaceholderWhenSelected
      emptyIndicator={t("widgets.multi_select_widget.no_more_options")}
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
