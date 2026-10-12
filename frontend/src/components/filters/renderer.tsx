import { type ComponentType, useMemo } from "react";

import { useAdminInfo } from "@/hooks/use-admin-info";
import { FieldType, FieldWidget, type Model, type ModelField } from "@/types";

import { BooleanFilter } from "./boolean-filter";
import { DateRangeFilter } from "./date-range-filter";
import { ForeignKeyFilter } from "./foreign-key-filter";
import { ManyToManyFilter } from "./many-to-many-filter";
import { MultiSelectFilter } from "./multi-select-filter";
import { NumberFilter } from "./number-filter";
import type {
  FilterChanges,
  FilterComponentProps,
  FilterValues,
} from "./types";

type FilterComponent = ComponentType<FilterComponentProps>;

const NUMBER_TYPES = [
  FieldType.IntegerField,
  FieldType.DecimalField,
  FieldType.FloatField,
];

export function FilterRenderer({
  field,
  name,
  model,
  values,
  onValueChange,
}: {
  field: ModelField;
  name: string;
  model: Model;
  values: FilterValues;
  onValueChange(changes: FilterChanges): void;
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
    if (field.type === FieldType.BooleanField) {
      return BooleanFilter;
    }
    if (
      field.type === FieldType.DateField ||
      field.type === FieldType.DateTimeField
    ) {
      return DateRangeFilter;
    }
    if (NUMBER_TYPES.includes(field.type)) {
      return NumberFilter;
    }
    if (widgetClass === FieldWidget.ForeignKeyWidget) {
      return ForeignKeyFilter;
    }
    if (widgetClass === FieldWidget.ManyToManyWidget) {
      return ManyToManyFilter;
    }
    return null;
  }, [field, widgetClass]);

  return (
    FilterComp && (
      <FilterComp
        field={field}
        name={name}
        model={model}
        values={values}
        onChange={onValueChange}
      />
    )
  );
}
