import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CodeEditor } from "@/components/ui/code-editor";
import { InvalidInput } from "@/lib/invalid-input";
import { formatJSON, parseJSON } from "@/lib/widget-values";
import type { CodeWidgetOptions, ModelField, WidgetProps } from "@/types";

type EditorProps = {
  field?: ModelField;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/** Code in a code editor, highlighted for options.language. */
export function CodeWidget({
  field,
  value,
  onChange,
  options,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: EditorProps & WidgetProps<string | null, CodeWidgetOptions>) {
  return (
    <CodeEditor
      id={id}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-label={field?.verbose_name}
      language={options?.language}
      value={value ?? ""}
      onChange={onChange}
    />
  );
}

/**
 * A JSONField's value in a JSON editor. Invalid JSON is underlined
 * where it stops parsing, and the field cannot be saved until it is
 * fixed.
 */
export function JSONWidget({
  field,
  value,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: EditorProps & WidgetProps<unknown>) {
  const { t } = useTranslation();
  const [text, setText] = useState(() =>
    value instanceof InvalidInput ? value.text : formatJSON(value),
  );
  // The value this widget last reported, to tell it from a new value
  // from outside (a reset after saving, a reverted change).
  const [reported, setReported] = useState<unknown>(value);

  if (value !== reported) {
    setReported(value);

    if (value instanceof InvalidInput) {
      setText(value.text);
    } else if (!R.equals(parseJSON(text, ""), value ?? null)) {
      setText(formatJSON(value));
    }
  }

  return (
    <CodeEditor
      id={id}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-label={field?.verbose_name}
      language="json"
      value={text}
      onChange={(next) => {
        const parsed = parseJSON(next, t("widgets.json_widget.invalid"));

        setText(next);
        setReported(parsed);
        onChange(parsed);
      }}
    />
  );
}
