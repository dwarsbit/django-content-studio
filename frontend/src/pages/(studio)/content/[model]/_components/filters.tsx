import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { FilterRenderer } from "@/components/filters/renderer";
import type { FilterValues } from "@/components/filters/types";
import { Button } from "@/components/ui/button";
import type { Model } from "@/types";

import { Search } from "./search";

const FILTER_PREFIX = "filters.";

/**
 * Collect the URL values of one filter field, keyed by lookup suffix
 * ("", "gte", ...). Exact matches take the field name; a `__`-suffix
 * carries the lookup, so `filters.published__gte` becomes "gte".
 */
function getFilterValues(
  searchParams: URLSearchParams,
  name: string,
): FilterValues {
  const values: FilterValues = {};

  for (const [key, value] of searchParams.entries()) {
    if (!key.startsWith(FILTER_PREFIX)) {
      continue;
    }
    const rest = key.slice(FILTER_PREFIX.length);
    if (rest !== name && !rest.startsWith(`${name}__`)) {
      continue;
    }
    values[rest.slice(name.length).replace(/^__/, "")] = value;
  }

  return values;
}

export function Filters({ model }: { model: Model }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
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
            values={getFilterValues(searchParams, name)}
            onValueChange={(changes) =>
              setSearchParams((searchParams) => {
                for (const [lookup, value] of Object.entries(changes)) {
                  const key = `${FILTER_PREFIX}${name}${lookup ? `__${lookup}` : ""}`;
                  if (value) {
                    searchParams.set(key, value);
                  } else {
                    searchParams.delete(key);
                  }
                }
                return searchParams;
              })
            }
          />
        ) : null;
      })}
      {Array.from(searchParams.keys()).some((key) =>
        key.startsWith("filters."),
      ) && (
        <Button
          variant="ghost"
          onClick={() =>
            setSearchParams((searchParams) => {
              const params = new URLSearchParams(searchParams);
              for (const key of searchParams.keys()) {
                if (key.startsWith("filters.")) {
                  params.delete(key);
                }
              }
              return params;
            })
          }
        >
          {t("list_view.clear_all_filters")}
        </Button>
      )}
    </div>
  );
}
