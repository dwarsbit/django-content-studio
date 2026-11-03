import { type ComponentType, useMemo } from "react";

import { useAdminInfo } from "@/hooks/use-admin-info";
import {
  FieldFormat,
  type FormatConfig,
  type FormatDisplay,
  type ModelField,
} from "@/types";

import { BadgeFormat } from "./badge-format";
import { BlockFormat } from "./block-format";
import { BooleanFormat } from "./boolean-format";
import { ChoiceFormat } from "./choice-format";
import { CodeFormat } from "./code-format";
import { ColorFormat } from "./color-format";
import { DateFormat } from "./date-format";
import { DatetimeFormat } from "./datetime-format";
import { DurationFormat } from "./duration-format";
import { FileFormat } from "./file-format";
import { FileSizeFormat } from "./file-size-format";
import { ForeignKeyFormat } from "./foreign-key-format";
import { HtmlFormat } from "./html-format";
import { ImageFormat } from "./image-format";
import { JSONFormat } from "./json-format";
import { EmailFormat, LinkFormat } from "./link-format";
import { ManyToManyFormat } from "./many-to-many-format";
import { ManyMediaFormat, MediaFormat } from "./media-format";
import { CurrencyFormat, NumberFormat, PercentFormat } from "./number-format";
import { ProgressFormat } from "./progress-format";
import { TagFormat } from "./tag-format";
import { TextFormat } from "./text-format";
import { TimeFormat } from "./time-format";

type FormatComponent = ComponentType<{
  value: unknown;
  field?: ModelField;
  emptyValue?: string | null;
  options?: Record<string, unknown>;
  display?: FormatDisplay;
}>;

const FORMATS: Partial<Record<FieldFormat, FormatComponent>> = {
  [FieldFormat.BadgeFormat]: BadgeFormat,
  [FieldFormat.BlockFormat]: BlockFormat,
  [FieldFormat.BooleanFormat]: BooleanFormat,
  [FieldFormat.CodeFormat]: CodeFormat,
  [FieldFormat.ColorFormat]: ColorFormat,
  [FieldFormat.CurrencyFormat]: CurrencyFormat,
  [FieldFormat.DateFormat]: DateFormat,
  [FieldFormat.DateTimeFormat]: DatetimeFormat,
  [FieldFormat.DurationFormat]: DurationFormat,
  [FieldFormat.EmailFormat]: EmailFormat,
  [FieldFormat.FileFormat]: FileFormat,
  [FieldFormat.FileSizeFormat]: FileSizeFormat,
  [FieldFormat.ForeignKeyFormat]: ForeignKeyFormat,
  [FieldFormat.HtmlFormat]: HtmlFormat,
  [FieldFormat.ImageFormat]: ImageFormat,
  [FieldFormat.JSONFormat]: JSONFormat,
  [FieldFormat.LinkFormat]: LinkFormat,
  [FieldFormat.ManyMediaFormat]: ManyMediaFormat,
  [FieldFormat.ManyToManyFormat]: ManyToManyFormat,
  [FieldFormat.MediaFormat]: MediaFormat,
  [FieldFormat.NumberFormat]: NumberFormat,
  [FieldFormat.PercentFormat]: PercentFormat,
  [FieldFormat.ProgressFormat]: ProgressFormat,
  [FieldFormat.TagFormat]: TagFormat,
  [FieldFormat.TextFormat]: TextFormat,
  [FieldFormat.TimeFormat]: TimeFormat,
};

export function FormatRenderer({
  value,
  field,
  emptyValue,
  format: formatOverride,
  display = "cell",
}: {
  value: unknown;
  field?: ModelField;
  emptyValue?: string | null;
  // An explicit format (e.g. a table column's); overrides the
  // field-type driven resolution.
  format?: FormatConfig | null;
  // A table cell, or a read-only field on the edit page.
  display?: FormatDisplay;
}) {
  const { data: info } = useAdminInfo();
  const format: FormatConfig = (field?.format_class
    ? { name: field.format_class }
    : null) ??
    formatOverride ??
    (field ? info?.formats[field.type] : undefined) ?? {
      name: FieldFormat.TextFormat,
    };
  const formatClass = format.name;

  const FormatComp = useMemo(() => {
    // A field with choices shows their labels, unless its format is a
    // badge, which shows them too, in color.
    if (field?.choices && formatClass !== FieldFormat.BadgeFormat) {
      return ChoiceFormat;
    }
    return FORMATS[formatClass] ?? TextFormat;
  }, [field?.choices, formatClass]);

  return (
    <FormatComp
      value={value}
      field={field}
      emptyValue={emptyValue}
      options={format.options}
      display={display}
    />
  );
}
