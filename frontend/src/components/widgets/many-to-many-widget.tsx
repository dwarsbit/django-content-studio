import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiChevronDown } from "react-icons/fi";
import { PiXBold } from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
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
import { useHttp } from "@/hooks/use-http";
import type { Model, Resource, WidgetProps } from "@/types";

import { RelationGlyph } from "./relation-glyph";
import { RelationOption } from "./relation-option";

/**
 * A multi-select over the related model's options. The trigger shows the
 * current selection as removable badges; the dropdown searches the relations
 * endpoint and adds what is picked. The dropdown markup mirrors the foreign
 * key widget, so both stay customizable in lockstep.
 */
export function ManyToManyWidget({
  name,
  model,
  value = [],
  onChange,
}: {
  name: string;
  model: Model;
} & WidgetProps<Resource[]>) {
  const { t } = useTranslation();
  const http = useHttp();
  const form = useFormContext();
  const id = form.getValues("id");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    enabled: open,
    queryKey: ["related-model", model.label, id, name, search],
    placeholderData: keepPreviousData,
    async queryFn() {
      const { data } = await http.post<Resource[]>(
        `/content/${model.label}/relations/${name}`,
        { search, id },
      );

      return data;
    },
  });

  // The dropdown offers what is not selected yet; selected options are
  // managed through their badges in the trigger.
  const selectables = useMemo<Resource[]>(() => {
    const selectedIds = new Set(value.map(R.prop<string>("id")));

    return data.filter((option) => !selectedIds.has(option.id));
  }, [data, value]);

  const remove = (option: Resource) => {
    onChange?.(value.filter((current) => current.id !== option.id));
  };

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          tabIndex={0}
          className="w-full min-h-8 flex flex-wrap items-center gap-1 rounded-md border bg-background hover:border-gray-400 focus-within:border-gray-400 cursor-pointer text-left px-3 py-1 select-none"
        >
          {value.map((option) => (
            <Badge
              key={option.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1 font-normal"
            >
              <RelationGlyph
                avatar={option.avatar}
                initials={option.initials}
                icon={option.icon}
                size="size-3"
                text="text-[8px]"
              />
              <span>{option.__str__}</span>
              <button
                type="button"
                aria-label={t("widgets.relation_widget.remove", {
                  item: option.__str__,
                })}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  remove(option);
                }}
                className="rounded-full outline-none cursor-pointer hover:bg-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-ring"
              >
                <PiXBold className="size-3" />
              </button>
            </Badge>
          ))}
          <FiChevronDown className="size-4 opacity-50 ml-auto shrink-0" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="max-h-[400px] w-[var(--radix-popover-trigger-width)] overflow-hidden p-0 flex flex-col">
        <div className="border-b border-gray-300">
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
            ) : R.isEmpty(selectables) ? (
              <div className="py-6 text-center text-sm text-muted-foreground select-none">
                {t("widgets.relation_widget.no_results")}
              </div>
            ) : (
              <CommandGroup>
                {selectables.map((option) => (
                  <CommandItem
                    key={option.id}
                    onSelect={() => {
                      onChange?.([...value, option]);
                    }}
                  >
                    <RelationOption option={option} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
