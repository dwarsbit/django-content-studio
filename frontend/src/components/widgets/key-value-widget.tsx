import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiPlusBold, PiXBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InvalidInput } from "@/lib/invalid-input";
import { rowsToValue } from "@/lib/widget-values";
import type { ModelField, WidgetProps } from "@/types";

let lastRowId = 0;

interface KeyValueRow {
  id: number;
  key: string;
  value: string;
}

function row(key = "", value = ""): KeyValueRow {
  lastRowId += 1;
  return { id: lastRowId, key, value };
}

function rowsOf(value: unknown): KeyValueRow[] {
  if (value instanceof InvalidInput) {
    const pairs = JSON.parse(value.text) as [string, string][];
    return pairs.map(([key, text]) => row(key, text));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).map(([key, text]) =>
      row(key, text == null ? "" : String(text)),
    );
  }

  return [];
}

/**
 * A JSONField dict of strings, edited as rows of a key and a value.
 * JSON objects have no order (PostgreSQL sorts their keys), so rows
 * cannot be reordered.
 */
export function KeyValueWidget({
  field,
  value,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
}: {
  field?: ModelField;
  id?: string;
  "aria-describedby"?: string;
} & WidgetProps<unknown>) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(() => rowsOf(value));
  const [reported, setReported] = useState<unknown>(value);
  const messages = {
    emptyKey: t("widgets.key_value_widget.empty_key"),
    duplicateKey: (key: string) =>
      t("widgets.key_value_widget.duplicate_key", { key }),
  };

  if (value !== reported) {
    setReported(value);

    const current = rowsToValue(rows, messages);

    if (value instanceof InvalidInput || !R.equals(current, value ?? {})) {
      setRows(rowsOf(value));
    }
  }

  function update(next: KeyValueRow[]) {
    const parsed = rowsToValue(next, messages);

    setRows(next);
    setReported(parsed);
    onChange(parsed);
  }

  const keys = rows.map((r) => r.key.trim());
  const isInvalid = (r: KeyValueRow, index: number) =>
    (!keys[index] && !!r.value.trim()) ||
    (!!keys[index] && keys.indexOf(keys[index]) !== index);

  return (
    <div
      id={id}
      role="group"
      aria-label={field?.verbose_name}
      aria-describedby={ariaDescribedBy}
      className="space-y-2"
    >
      {rows.map((r, index) => (
        <div key={r.id} className="flex items-center gap-2">
          <Input
            value={r.key}
            aria-label={t("widgets.key_value_widget.key")}
            placeholder={t("widgets.key_value_widget.key")}
            aria-invalid={isInvalid(r, index) || undefined}
            className="w-2/5"
            onChange={(e) =>
              update(R.update(index, { ...r, key: e.target.value }, rows))
            }
          />
          <Input
            value={r.value}
            aria-label={t("widgets.key_value_widget.value")}
            placeholder={t("widgets.key_value_widget.value")}
            className="flex-1"
            onChange={(e) =>
              update(R.update(index, { ...r, value: e.target.value }, rows))
            }
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("widgets.key_value_widget.remove", {
              key: r.key || index + 1,
            })}
            onClick={() => update(R.remove(index, 1, rows))}
          >
            <PiXBold />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setRows([...rows, row()])}
      >
        <PiPlusBold />
        {t("widgets.key_value_widget.add")}
      </Button>
    </div>
  );
}
