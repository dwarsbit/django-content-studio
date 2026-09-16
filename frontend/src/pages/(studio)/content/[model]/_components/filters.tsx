import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { FilterRenderer } from "@/components/filters/renderer";
import { Button } from "@/components/ui/button";
import type { Model } from "@/types";

import { Search } from "./search";

export function Filters({ model }: { model: Model }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = model.admin.list.filter ?? [];

  return (
    <div className="flex items-start gap-4">
      {model.admin.list.search && <Search />}
      {filters.map((filter) => {
        const field = model.fields[filter];
        const activeFilter = searchParams.get(`filters.${filter}`) ?? "";

        return field ? (
          <FilterRenderer
            field={field}
            value={activeFilter}
            onValueChange={(value) =>
              setSearchParams((searchParams) => {
                searchParams.set(`filters.${filter}`, value);
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
          size="sm"
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
