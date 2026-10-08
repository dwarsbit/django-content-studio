import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { MultiSelect } from "@/components/ui/multi-select";
import { useHttp } from "@/hooks/use-http";
import type { Model, Resource, WidgetProps } from "@/types";

export function ManyToManyWidget({
  name,
  model,
  value = [],
  onChange,
}: {
  name: string;
  model: Model;
} & WidgetProps<Resource[]>) {
  const http = useHttp();
  const form = useFormContext();
  const [search, setSearch] = useState("");
  const id = form.getValues("id");
  const { data = [] } = useQuery({
    retry: false,
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

  return (
    <MultiSelect
      inputProps={{ onValueChange: setSearch }}
      commandProps={{ shouldFilter: false }}
      options={
        data.map(({ id, __str__ }) => ({
          label: __str__,
          value: id,
        })) ?? []
      }
      value={value.map(({ id, __str__ }) => ({
        value: id,
        label: __str__,
      }))}
      onChange={(options) =>
        onChange(
          options.map(({ value, label }) => ({ id: value, __str__: label })),
        )
      }
    />
  );
}
