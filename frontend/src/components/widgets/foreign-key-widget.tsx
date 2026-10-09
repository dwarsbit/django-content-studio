import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiChevronDown } from "react-icons/fi";

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

export function ForeignKeyWidget({
  name,
  model,
  value,
  onChange,
}: {
  name: string;
  model: Model;
} & WidgetProps<Resource | null>) {
  const { t } = useTranslation();
  const http = useHttp();
  const form = useFormContext();
  const formValues = form.watch();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    enabled: open,
    queryKey: ["related-model", model.label, name, formValues, search],
    placeholderData: keepPreviousData,
    async queryFn() {
      const { data } = await http.post<Resource[]>(
        `/content/${model.label}/relations/${name}`,
        { search, form: formValues },
      );

      return data;
    },
  });
  const dataWithValue = useMemo<Resource[]>(() => {
    const withCurrent =
      !R.isNil(value) && R.isEmpty(search) ? [value, ...data] : data;

    return R.uniqBy(R.prop("id"), withCurrent);
  }, [data, value, search]);

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="w-full font-medium text-gray-700 flex items-center justify-between text-left border border-gray-300 hover:border-gray-400 cursor-pointer rounded-md px-3 h-8 select-none">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <RelationGlyph
            avatar={value?.avatar}
            initials={value?.initials}
            icon={value?.icon}
            size="size-4"
            text="text-[9px]"
          />
          <span className="line-clamp-1">{value?.__str__}</span>
        </div>
        <FiChevronDown className="size-4 opacity-50" />
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
            ) : R.isEmpty(dataWithValue) ? (
              <div className="py-6 text-center text-sm text-muted-foreground select-none">
                {t("widgets.relation_widget.no_results")}
              </div>
            ) : (
              <CommandGroup>
                {dataWithValue.map((option) => (
                  <CommandItem
                    key={option.id}
                    onSelect={() => {
                      onChange?.(option);
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
      </PopoverContent>
    </Popover>
  );
}
