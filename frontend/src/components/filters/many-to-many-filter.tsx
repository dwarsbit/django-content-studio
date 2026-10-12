import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronDown } from "react-icons/fi";
import { PiCheckBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
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
import { RelationOption } from "@/components/widgets/relation-option";
import { useHttp } from "@/hooks/use-http";
import type { Resource } from "@/types";

import type { FilterComponentProps } from "./types";

/**
 * Resolves the display label of one selected related object. Shares the
 * query key with the foreign key filter, so a selected object is
 * resolved once.
 */
function SelectedLabel({
  relatedModel,
  id,
}: {
  relatedModel: string;
  id: string;
}) {
  const http = useHttp();
  const { data } = useQuery({
    queryKey: ["filter-relations-selected", relatedModel, id],
    async queryFn() {
      const { data } = await http.get<Resource>(
        `/content/${relatedModel}/${id}`,
      );

      return data;
    },
  });

  return <>{data?.__str__ ?? id}</>;
}

/**
 * A searchable multi-select over the related model's objects, powered by
 * the same relations endpoint the ManyToMany widget uses (relation
 * display included). The selection is a comma-joined list of pks, which
 * the filter backend resolves to an "any of" match.
 */
export function ManyToManyFilter({
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
  const selected = (values[""] ?? "").split(",").filter(Boolean);

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

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((current) => current !== id)
      : [...selected, id];

    onChange({ "": next.join(",") || null });
  };

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-8 font-medium text-foreground gap-2"
        >
          {field.verbose_name}
          <span className="font-normal text-muted-foreground empty:hidden">
            {selected.map((id, index) => (
              <span key={id}>
                {index > 0 && ", "}
                <SelectedLabel
                  relatedModel={field.related_model ?? ""}
                  id={id}
                />
              </span>
            ))}
          </span>
          <FiChevronDown className="size-4 opacity-50" />
        </Button>
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
                    onSelect={() => toggle(String(option.id))}
                  >
                    <span className="flex-1 flex items-center gap-2 min-w-0">
                      {selected.includes(String(option.id)) ? (
                        <PiCheckBold className="size-4 shrink-0" />
                      ) : (
                        <span className="size-4 shrink-0" />
                      )}
                      <RelationOption option={option} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {selected.length > 0 && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground rounded-sm py-1 cursor-pointer"
              onClick={() => onChange({ "": null })}
            >
              {t("common.clear")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
