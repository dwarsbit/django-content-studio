import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiFunnelBold } from "react-icons/pi";
import { useSearchParams } from "react-router";

import { FilterRenderer } from "@/components/filters/renderer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { type Model } from "@/types";

export function FiltersSelect({ model }: { model: Model }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Array.from(searchParams.entries());
  const activeFilters = filters.filter(([key]) => key.startsWith("filters."));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="relative">
          {activeFilters.length > 0 && (
            <div className="bg-rose-500 text-white absolute -right-1.5 -top-1.5 rounded-xl px-1 text-[10px] font-bold">
              {activeFilters.length}
            </div>
          )}
          <PiFunnelBold />
          {t("list_view.filter")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="p-0" align="start">
        <div className="border-b border-gray-200">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="border-0"
            autoFocus
          />
        </div>
        <DropdownMenuGroup className="p-1">
          {model.admin.list.filter
            .filter(
              (filter) =>
                !search ||
                model.fields[filter]?.verbose_name
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            )
            .map((filter) => {
              const field = model.fields[filter];
              const activeFilter = searchParams.get(`filters.${filter}`) ?? "";

              return field ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-1.5">
                    {field.verbose_name}
                    {!R.isEmpty(activeFilter) && (
                      <div className="size-1 rounded-full bg-rose-400" />
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
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
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null;
            })}
        </DropdownMenuGroup>
        {activeFilters.length > 0 && (
          <div className="p-1 border-t border-gray-200">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() =>
                setSearchParams((searchParams) => {
                  for (const [f] of activeFilters) {
                    searchParams.delete(f);
                  }

                  return searchParams;
                })
              }
            >
              {t("list_view.clear_all_filters")}
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
