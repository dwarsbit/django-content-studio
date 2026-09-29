import { type ComponentType, useMemo } from "react";

import { useAdminInfo } from "@/hooks/use-admin-info";
import { FieldWidget, type ModelField } from "@/types";

import { MultiSelectFilter } from "./multi-select-filter";

type FilterComponent = ComponentType<{
  value?: string;
  onChange(value: string): void;
  field: ModelField;
}>;

export function FilterRenderer({
  field,
  value,
  onValueChange,
}: {
  field: ModelField;
  value: string;
  onValueChange(value: string): void;
}) {
  const { data: info } = useAdminInfo();
  const widgetClass = field.widget_class ?? info?.widgets[field.type]?.name;

  const FilterComp = useMemo<FilterComponent | null>(() => {
    if (widgetClass === FieldWidget.InputWidget && field.choices) {
      return MultiSelectFilter;
    }
    if (widgetClass === FieldWidget.MultiSelectWidget) {
      return MultiSelectFilter;
    }
    return null;
  }, [field.choices, widgetClass]);

  return (
    FilterComp && (
      <FilterComp value={value} onChange={onValueChange} field={field} />
    )
  );
}
