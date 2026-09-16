import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
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

  return field.choices?.map(([key, label]) => (
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
  ));
}
