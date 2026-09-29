import { type ComponentType, useMemo } from "react";

import { useAdminInfo } from "@/hooks/use-admin-info";
import { FieldWidget, type Model, type ModelField } from "@/types";

import { CheckboxWidget } from "./checkbox-widget";
import { DateTimeWidget } from "./date-time-widget";
import { DateWidget } from "./date-widget";
import { FallbackWidget } from "./fallback-widget";
import { ForeignKeyWidget } from "./foreign-key-widget";
import { InputWidget } from "./input-widget";
import { JSONSchemaWidget } from "./json-schema-widget";
import { ManyMediaWidget } from "./many-media-widget";
import { ManyToManyWidget } from "./many-to-many-widget";
import { MediaWidget } from "./media-widget";
import { MultiSelectWidget } from "./multi-select-widget";
import { RichTextWidget } from "./rich-text-widget";
import { SelectWidget } from "./select-widget";
import { SlugWidget } from "./slug-widget";
import { TagWidget } from "./tag-widget";
import { TextAreaWidget } from "./text-area-widget";
import { TimeWidget } from "./time-widget";
import { URLPathWidget } from "./url-path-widget";

type WidgetComponent = ComponentType<{
  value: any;
  onChange(value: any): void;
  model: Model;
  field: ModelField;
  name: string;
}>;

const WIDGETS: Partial<Record<FieldWidget, WidgetComponent>> = {
  [FieldWidget.CheckboxWidget]: CheckboxWidget,
  [FieldWidget.DateWidget]: DateWidget,
  [FieldWidget.DateTimeWidget]: DateTimeWidget,
  [FieldWidget.ForeignKeyWidget]: ForeignKeyWidget,
  [FieldWidget.JSONSchemaWidget]: JSONSchemaWidget,
  [FieldWidget.ManyToManyWidget]: ManyToManyWidget,
  [FieldWidget.ManyMediaWidget]: ManyMediaWidget,
  [FieldWidget.MediaWidget]: MediaWidget,
  [FieldWidget.MultiSelectWidget]: MultiSelectWidget,
  [FieldWidget.RichTextWidget]: RichTextWidget,
  [FieldWidget.SlugWidget]: SlugWidget,
  [FieldWidget.TagWidget]: TagWidget,
  [FieldWidget.TextAreaWidget]: TextAreaWidget,
  [FieldWidget.TimeWidget]: TimeWidget,
  [FieldWidget.URLPathWidget]: URLPathWidget,
};

export function WidgetRenderer({
  value,
  onChange,
  model,
  name,
}: {
  value: any;
  onChange(value: any): void;
  model: Model;
  name: string;
}) {
  const { data: info } = useAdminInfo();
  const field = model.fields[name];
  const widgetClass =
    field.widget_class ?? info?.widgets[field.type]?.name ?? null;

  const WidgetComp = useMemo(() => {
    if (widgetClass === null) {
      return InputWidget;
    }
    if (widgetClass === FieldWidget.InputWidget && field.choices) {
      return SelectWidget;
    }
    return WIDGETS[widgetClass] ?? FallbackWidget;
  }, [field.choices, widgetClass]);

  return (
    <WidgetComp
      value={value}
      onChange={onChange}
      model={model}
      field={field}
      name={name}
    />
  );
}
