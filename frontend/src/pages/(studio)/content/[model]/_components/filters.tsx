import { useTranslation } from "react-i18next";

import { FilterRenderer } from "@/components/filters/renderer";
import type { FilterValues } from "@/components/filters/types";
import { Button } from "@/components/ui/button";
import type { Model } from "@/types";

import { Search } from "./search";

/**
 * Collects the remembered values of one filter field, keyed by lookup
 * suffix ("", "gte", ...). Exact matches take the field name; a `__`
 * suffix carries the lookup, so "published__gte" becomes "gte".
 */
function getFilterValues(
  values: Record<string, string>,
  name: string,
): FilterValues {
  const collected: FilterValues = {};

  for (const [key, value] of Object.entries(values)) {
    if (key !== name && !key.startsWith(`${name}__`)) {
      continue;
    }
    collected[key.slice(name.length).replace(/^__/, "")] = value;
  }

  return collected;
}

export function Filters({
  model,
  values,
  onValuesChange,
}: {
  model: Model;
  // The remembered filter values: "field" / "field__lookup" to value.
  values: Record<string, string>;
  onValuesChange: (next: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const filters = model.admin.list.filter ?? [];

  return (
    <div className="flex items-start gap-4">
      {model.admin.list.search && <Search />}
      {filters.map((name) => {
        const field = model.fields[name];

        return field ? (
          <FilterRenderer
            key={name}
            field={field}
            name={name}
            model={model}
            values={getFilterValues(values, name)}
            onValueChange={(changes) => {
              const next = { ...values };

              for (const [lookup, value] of Object.entries(changes)) {
                const key = `${name}${lookup ? `__${lookup}` : ""}`;
                if (value) {
                  next[key] = value;
                } else {
                  delete next[key];
                }
              }

              onValuesChange(next);
            }}
          />
        ) : null;
      })}
      {Object.keys(values).length > 0 && (
        <Button variant="ghost" onClick={() => onValuesChange({})}>
          {t("list_view.clear_all_filters")}
        </Button>
      )}
    </div>
  );
}
