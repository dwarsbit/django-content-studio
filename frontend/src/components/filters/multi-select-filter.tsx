import * as R from "ramda";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModelField } from "@/types";

export function MultiSelectFilter({
  field,
  value = "",
  onChange,
}: {
  field: ModelField;
  onChange(value: string): void;
  value?: string;
}) {
  const valueArray = value.split(",");
  const choices = R.fromPairs(field.choices ?? []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {field.verbose_name}
          <span className="empty:hidden font-normal text-muted-foreground">
            {valueArray.map((value) => choices[value]).join(", ")}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {field.choices?.map(([key, label]) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={valueArray.includes(key)}
            onSelect={(e) => {
              e.preventDefault();
              onChange(
                (valueArray.includes(key)
                  ? valueArray.filter((i) => i !== key)
                  : [...valueArray, key]
                )
                  .filter(Boolean)
                  .join(","),
              );
            }}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
