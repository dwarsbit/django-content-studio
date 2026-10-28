import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { RelationGlyph } from "@/components/widgets/relation-glyph";
import { RelationOption } from "@/components/widgets/relation-option";
import { useHttp } from "@/hooks/use-http";
import type { Resource } from "@/types";

import { FilterTrigger } from "./filter-trigger";
import type { FilterComponentProps } from "./types";

/**
 * A searchable select over the related model's objects, powered by the
 * same relations endpoint the ForeignKey widget uses (relation display
 * included). The selected object is fetched separately so the trigger
 * stays labeled after a reload. Selecting the current value again, or
 * the clear button, removes the filter.
 */
export function ForeignKeyFilter({
  field,
  model,
  name,
  values,
  onChange,
}: FilterComponentProps) {
  const { t } = useTranslation();
  const http = useHttp();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const value = values[""] ?? "";

  const { data = [], isLoading } = useQuery({
    enabled: open,
    queryKey: ["filter-relations", model.label, name, search],
    placeholderData: keepPreviousData,
    async queryFn() {
      const { data } = await http.post<Resource[]>(
        `/content/${model.label}/relations/${name}`,
        { search, form: {} },
      );

      return data;
    },
  });

  const { data: selected } = useQuery({
    enabled: Boolean(value),
    queryKey: ["filter-relations-selected", field.related_model, value],
    async queryFn() {
      const { data } = await http.get<Resource>(
        `/content/${field.related_model}/${value}`,
      );

      return data;
    },
  });

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterTrigger
          label={field.verbose_name}
          value={
            value ? (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <RelationGlyph
                  avatar={selected?.avatar}
                  initials={selected?.initials}
                  icon={selected?.icon}
                  size="size-4"
                  text="text-[9px]"
                />
                <span className="truncate">{selected?.__str__ ?? value}</span>
              </span>
            ) : (
              ""
            )
          }
          onClear={() => onChange({ "": null })}
        />
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[400px] w-[var(--radix-popover-trigger-width)] overflow-hidden p-0 flex flex-col"
        align="start"
      >
        <div className="border-b border-border">
          <Input
            autoFocus
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0"
          />
        </div>
        <Command shouldFilter={false}>
          <CommandList className="scrollbar">
            {isLoading ? (
              <div role="status" className="py-6 flex justify-center">
                <Spinner />
              </div>
            ) : R.isEmpty(data) ? (
              <div className="py-6 text-center text-sm text-muted-foreground select-none">
                {t("widgets.relation_widget.no_results")}
              </div>
            ) : (
              <CommandGroup>
                {data.map((option) => (
                  <CommandItem
                    key={option.id}
                    onSelect={() => {
                      onChange({
                        "":
                          String(option.id) === value
                            ? null
                            : String(option.id),
                      });
                      setOpen(false);
                    }}
                  >
                    <RelationOption option={option} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {value && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground rounded-sm py-1 cursor-pointer"
              onClick={() => {
                onChange({ "": null });
                setOpen(false);
              }}
            >
              {t("common.clear")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
