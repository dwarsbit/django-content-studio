import * as R from "ramda";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { FilterTrigger } from "./filter-trigger";
import type { FilterComponentProps } from "./types";

export function MultiSelectFilter({
  field,
  values,
  onChange,
}: FilterComponentProps) {
  const value = values[""] ?? "";
  const valueArray = value.split(",");
  const choices = R.fromPairs(field.choices ?? []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterTrigger
          label={field.verbose_name}
          value={valueArray
            .filter(Boolean)
            .map((value) => choices[value])
            .join(", ")}
          onClear={() => onChange({ "": null })}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {field.choices?.map(([key, label]) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={valueArray.includes(key)}
            onSelect={(e) => {
              e.preventDefault();
              onChange({
                "":
                  (valueArray.includes(key)
                    ? valueArray.filter((i) => i !== key)
                    : [...valueArray, key]
                  )
                    .filter(Boolean)
                    .join(",") || null,
              });
            }}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
