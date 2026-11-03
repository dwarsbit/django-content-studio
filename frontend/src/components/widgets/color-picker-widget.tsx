import { useTranslation } from "react-i18next";

import { ColorPicker } from "@/components/ui/color-picker";
import { COLOR_FORMATS, type ColorFormat } from "@/lib/colors";
import type {
  ColorPickerWidgetOptions,
  ModelField,
  WidgetProps,
} from "@/types";

export function ColorPickerWidget({
  value,
  onChange,
  field,
  options = {},
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  field: ModelField;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
} & WidgetProps<string | null, ColorPickerWidgetOptions>) {
  const { t } = useTranslation();
  // The field's notation: a ColorField's, or a ColorValidator's on a
  // plain field; hex otherwise.
  const format: ColorFormat = COLOR_FORMATS.includes(
    field.color_format as ColorFormat,
  )
    ? (field.color_format as ColorFormat)
    : "hex";

  return (
    <ColorPicker
      value={value}
      onChange={onChange}
      format={format}
      alpha={field.alpha ?? false}
      showInput={options.show_input ?? true}
      swatches={options.swatches}
      clearable={!field.required}
      id={id}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      labels={{
        picker: t("widgets.color_picker.pick"),
        input: t("widgets.color_picker.input"),
        clear: t("common.clear"),
      }}
    />
  );
}
