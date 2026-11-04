import { type ComponentType, useMemo } from "react";

import { useAdminInfo } from "@/hooks/use-admin-info";
import {
  FieldWidget,
  type Model,
  type ModelField,
  type WidgetConfig,
} from "@/types";

import { BlockWidget } from "./block-widget/block-widget";
import { CheckboxWidget } from "./checkbox-widget";
import { CodeWidget, JSONWidget } from "./code-widget";
import { ColorPickerWidget } from "./color-picker-widget";
import { CoverImageWidget } from "./cover-image-widget/cover-image-widget";
import { DateTimeWidget } from "./date-time-widget";
import { DateWidget } from "./date-widget";
import { DurationWidget } from "./duration-widget";
import { FallbackWidget } from "./fallback-widget";
import { FileWidget } from "./file-widget";
import { ForeignKeyWidget } from "./foreign-key-widget";
import { IconPickerWidget } from "./icon-picker-widget";
import { InputWidget } from "./input-widget";
import { JSONSchemaWidget } from "./json-schema-widget";
import { KeyValueWidget } from "./key-value-widget";
import { ListWidget } from "./list-widget";
import { ManyMediaWidget } from "./many-media-widget";
import { ManyToManyWidget } from "./many-to-many-widget";
import { MarkdownWidget } from "./markdown-widget";
import { MediaWidget } from "./media-widget";
import { MultiSelectWidget } from "./multi-select-widget";
import { PasswordWidget } from "./password-widget";
import { RadioButtonWidget } from "./radio-button-widget";
import { RatingWidget } from "./rating-widget";
import { RichTextWidget } from "./rich-text-widget";
import { SelectWidget } from "./select-widget";
import { SliderWidget } from "./slider-widget";
import { SlugWidget } from "./slug-widget";
import { SwitchWidget } from "./switch-widget";
import { TagWidget } from "./tag-widget";
import { TextAreaWidget } from "./text-area-widget";
import { TimeWidget } from "./time-widget";
import { ToggleGroupWidget } from "./toggle-group-widget";
import { EmailWidget, PhoneWidget, URLWidget } from "./typed-input-widgets";
import { URLPathWidget } from "./url-path-widget";

type WidgetComponent = ComponentType<{
  value: unknown;
  onChange(value: unknown): void;
  model: Model;
  field: ModelField;
  name: string;
  options?: Record<string, unknown>;
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
  [FieldWidget.BlockWidget]: BlockWidget,
  [FieldWidget.CheckboxWidget]: CheckboxWidget,
  [FieldWidget.CodeWidget]: CodeWidget,
  [FieldWidget.ColorPickerWidget]: ColorPickerWidget,
  [FieldWidget.CoverImageWidget]: CoverImageWidget,
  [FieldWidget.DateWidget]: DateWidget,
  [FieldWidget.DateTimeWidget]: DateTimeWidget,
  [FieldWidget.DurationWidget]: DurationWidget,
  [FieldWidget.EmailWidget]: EmailWidget,
  [FieldWidget.FileWidget]: FileWidget,
  [FieldWidget.ForeignKeyWidget]: ForeignKeyWidget,
  [FieldWidget.IconPickerWidget]: IconPickerWidget,
  [FieldWidget.InputWidget]: InputWidget,
  [FieldWidget.JSONSchemaWidget]: JSONSchemaWidget,
  [FieldWidget.JSONWidget]: JSONWidget,
  [FieldWidget.KeyValueWidget]: KeyValueWidget,
  [FieldWidget.ListWidget]: ListWidget,
  [FieldWidget.MarkdownWidget]: MarkdownWidget,
  [FieldWidget.ManyToManyWidget]: ManyToManyWidget,
  [FieldWidget.ManyMediaWidget]: ManyMediaWidget,
  [FieldWidget.MediaWidget]: MediaWidget,
  [FieldWidget.MultiSelectWidget]: MultiSelectWidget,
  [FieldWidget.PasswordWidget]: PasswordWidget,
  [FieldWidget.PhoneWidget]: PhoneWidget,
  [FieldWidget.RadioButtonWidget]: RadioButtonWidget,
  [FieldWidget.RatingWidget]: RatingWidget,
  [FieldWidget.RichTextWidget]: RichTextWidget,
  [FieldWidget.SelectWidget]: SelectWidget,
  [FieldWidget.SliderWidget]: SliderWidget,
  [FieldWidget.SlugWidget]: SlugWidget,
  [FieldWidget.SwitchWidget]: SwitchWidget,
  [FieldWidget.TagWidget]: TagWidget,
  [FieldWidget.TextAreaWidget]: TextAreaWidget,
  [FieldWidget.TimeWidget]: TimeWidget,
  [FieldWidget.ToggleGroupWidget]: ToggleGroupWidget,
  [FieldWidget.URLPathWidget]: URLPathWidget,
  [FieldWidget.URLWidget]: URLWidget,
} as Partial<Record<FieldWidget, WidgetComponent>>;

export function WidgetRenderer({
  value,
  onChange,
  model,
  name,
  widget: widgetOverride,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: unknown;
  onChange(value: unknown): void;
  model: Model;
  name: string;
  // Widget override from the form field's configuration.
  widget?: WidgetConfig | null;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const { data: info } = useAdminInfo();
  const field = model.fields[name];
  const widget: WidgetConfig | null =
    widgetOverride ??
    (field.widget_class ? { name: field.widget_class } : null) ??
    info?.widgets[field.type] ??
    null;
  const widgetClass = widget?.name ?? null;

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
      options={widget?.options}
      id={id}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
    />
  );
}
