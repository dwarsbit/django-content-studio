import { type ComponentType, useMemo } from "react";

import { useAdminInfo } from "@/hooks/use-admin-info";
import { FieldFormat, type ModelField } from "@/types";

import { BooleanFormat } from "./boolean-format";
import { ChoiceFormat } from "./choice-format";
import { DateFormat } from "./date-format";
import { DatetimeFormat } from "./datetime-format";
import { FileFormat } from "./file-format";
import { FileSizeFormat } from "./file-size-format";
import { ForeignKeyFormat } from "./foreign-key-format";
import { JSONFormat } from "./json-format";
import { MediaFormat } from "./media-format";
import { TextFormat } from "./text-format";
import { TimeFormat } from "./time-format";

type FormatComponent = ComponentType<{
  value: unknown;
  field?: ModelField;
  emptyValue?: string | null;
}>;

const FORMATS: Partial<Record<FieldFormat, FormatComponent>> = {
  [FieldFormat.BooleanFormat]: BooleanFormat,
  [FieldFormat.DateFormat]: DateFormat,
  [FieldFormat.DateTimeFormat]: DatetimeFormat,
  [FieldFormat.FileFormat]: FileFormat,
  [FieldFormat.FileSizeFormat]: FileSizeFormat,
  [FieldFormat.ForeignKeyFormat]: ForeignKeyFormat,
  [FieldFormat.JSONFormat]: JSONFormat,
  [FieldFormat.MediaFormat]: MediaFormat,
  [FieldFormat.TimeFormat]: TimeFormat,
};

export function FormatRenderer({
  value,
  field,
  emptyValue,
}: {
  value: unknown;
  field?: ModelField;
  emptyValue?: string | null;
}) {
  const { data: info } = useAdminInfo();
  const formatClass =
    field?.format_class ??
    (field ? info?.formats[field.type]?.name : undefined) ??
    FieldFormat.TextFormat;

  const FormatComp = useMemo(() => {
    if (field?.choices) {
      return ChoiceFormat;
    }
    return FORMATS[formatClass] ?? TextFormat;
  }, [field?.choices, formatClass]);

  return <FormatComp value={value} field={field} emptyValue={emptyValue} />;
}
