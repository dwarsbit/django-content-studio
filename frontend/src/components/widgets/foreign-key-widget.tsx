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
import { useHttp } from "@/hooks/use-http";
import type { Model, Resource } from "@/types";

export function ForeignKeyWidget({
  name,
  model,
  value,
  onChange,
}: {
  name: string;
  model: Model;
  onChange?: any;
  value?: any;
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const form = useFormContext();
  const formValues = form.watch();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
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
  const dataWithValue = useMemo<Resource[]>(
    () =>
      R.pipe(
        R.unless(() => R.isNil(value) || !R.isEmpty(search), R.prepend(value)),
        R.uniqBy(R.prop("id")),
      )(data),
    [data, value, search],
  );

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="w-full font-medium text-gray-700 flex items-center justify-between text-left border border-gray-300 hover:border-gray-400 cursor-pointer rounded-md px-3 h-8 shadow-xs select-none">
        <div className="flex-1">{value?.__str__}</div>
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
            <CommandGroup>
              {dataWithValue.map(({ id, __str__ }) => (
                <CommandItem
                  key={id}
                  onSelect={() => {
                    onChange?.({ id, __str__ });
                    setOpen(false);
                  }}
                >
                  <div className="line-clamp-1">{__str__}</div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
