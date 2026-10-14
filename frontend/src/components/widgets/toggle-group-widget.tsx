import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ModelField, WidgetProps } from "@/types";

export function ToggleGroupWidget({
  field,
  value,
  onChange,
}: {
  field: ModelField;
} & WidgetProps<string | null>) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value ?? ""}
      onValueChange={(next) => {
        // Radix deselects the active toggle in single mode; a required
        // field keeps its value instead of clearing it.
        if (!next) {
          if (!field.required) {
            onChange?.(null);
          }

          return;
        }

        onChange?.(next);
      }}
    >
      {field.choices?.map(([choiceValue, label]) => (
        <ToggleGroupItem key={choiceValue} value={choiceValue}>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
