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
import { SwitchWidget } from "./switch-widget";
import { TagWidget } from "./tag-widget";
import { TextAreaWidget } from "./text-area-widget";
import { TimeWidget } from "./time-widget";
import { ToggleGroupWidget } from "./toggle-group-widget";
import { URLPathWidget } from "./url-path-widget";

type WidgetComponent = ComponentType<{
  value: unknown;
  onChange(value: unknown): void;
  model: Model;
  field: ModelField;
  name: string;
  // Form control wiring: the id associates the control with its label
  // (clicking the label toggles checkbox- and switch-based widgets);
  // the aria props tie help text and errors to the control.
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}>;

// Widget value shapes are model-defined at runtime; each widget instantiates
// `WidgetProps<T>` with its concrete type. This registry is the single point
// where those per-widget types meet the `unknown` values the form hands the
// renderer, so it is asserted once here rather than weakened with `any`
// in every widget.
const WIDGETS = {
  [FieldWidget.CheckboxWidget]: CheckboxWidget,
  [FieldWidget.DateWidget]: DateWidget,
  [FieldWidget.DateTimeWidget]: DateTimeWidget,
  [FieldWidget.ForeignKeyWidget]: ForeignKeyWidget,
  [FieldWidget.InputWidget]: InputWidget,
  [FieldWidget.JSONSchemaWidget]: JSONSchemaWidget,
  [FieldWidget.ManyToManyWidget]: ManyToManyWidget,
  [FieldWidget.ManyMediaWidget]: ManyMediaWidget,
  [FieldWidget.MediaWidget]: MediaWidget,
  [FieldWidget.MultiSelectWidget]: MultiSelectWidget,
  [FieldWidget.RichTextWidget]: RichTextWidget,
  [FieldWidget.SelectWidget]: SelectWidget,
  [FieldWidget.SlugWidget]: SlugWidget,
  [FieldWidget.SwitchWidget]: SwitchWidget,
  [FieldWidget.TagWidget]: TagWidget,
  [FieldWidget.TextAreaWidget]: TextAreaWidget,
  [FieldWidget.TimeWidget]: TimeWidget,
  [FieldWidget.ToggleGroupWidget]: ToggleGroupWidget,
  [FieldWidget.URLPathWidget]: URLPathWidget,
} as Partial<Record<FieldWidget, WidgetComponent>>;

export function WidgetRenderer({
  value,
  onChange,
  model,
  name,
  widgetClass: widgetClassOverride,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: unknown;
  onChange(value: unknown): void;
  model: Model;
  name: string;
  // Widget override from the form field's configuration.
  widgetClass?: FieldWidget | null;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const { data: info } = useAdminInfo();
  const field = model.fields[name];
  const widgetClass =
    widgetClassOverride ??
    field.widget_class ??
    info?.widgets[field.type]?.name ??
    null;

  const WidgetComp = useMemo<WidgetComponent>(() => {
    if (widgetClass === null) {
      return WIDGETS[FieldWidget.InputWidget] ?? FallbackWidget;
    }
    if (widgetClass === FieldWidget.InputWidget && field.choices) {
      return WIDGETS[FieldWidget.SelectWidget] ?? FallbackWidget;
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
      id={id}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
    />
  );
}
