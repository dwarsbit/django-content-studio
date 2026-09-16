import * as R from "ramda";
import React, { useMemo } from "react";

import { useAdminInfo } from "@/hooks/use-admin-info";
import { FieldWidget, type Model } from "@/types";

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

  const WidgetComp = useMemo(
    () =>
      R.cond([
        [R.isNil, R.always(InputWidget)],
        [
          () =>
            widgetClass === FieldWidget.InputWidget && !R.isNil(field.choices),
          R.always(SelectWidget),
        ],
        [R.equals(FieldWidget.DateWidget), R.always(DateWidget)],
        [R.equals(FieldWidget.DateTimeWidget), R.always(DateTimeWidget)],
        [R.equals(FieldWidget.ForeignKeyWidget), R.always(ForeignKeyWidget)],
        [R.equals(FieldWidget.InputWidget), R.always(InputWidget)],
        [R.equals(FieldWidget.JSONSchemaWidget), R.always(JSONSchemaWidget)],
        [R.equals(FieldWidget.ManyToManyWidget), R.always(ManyToManyWidget)],
        [R.equals(FieldWidget.MediaWidget), R.always(MediaWidget)],
        [R.equals(FieldWidget.ManyMediaWidget), R.always(ManyMediaWidget)],
        [R.equals(FieldWidget.MultiSelectWidget), R.always(MultiSelectWidget)],
        [R.equals(FieldWidget.RichTextWidget), R.always(RichTextWidget)],
        [R.equals(FieldWidget.TextAreaWidget), R.always(TextAreaWidget)],
        [R.equals(FieldWidget.SlugWidget), R.always(SlugWidget)],
        [R.equals(FieldWidget.TagWidget), R.always(TagWidget)],
        [R.equals(FieldWidget.URLPathWidget), R.always(URLPathWidget)],
        [R.equals(FieldWidget.CheckboxWidget), R.always(CheckboxWidget)],
        [R.equals(FieldWidget.TimeWidget), R.always(TimeWidget)],
        [R.T, R.always(FallbackWidget)],
      ])(widgetClass),
    [field.choices, widgetClass],
  );

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
