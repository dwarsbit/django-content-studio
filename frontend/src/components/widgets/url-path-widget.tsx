import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { WidgetProps } from "@/types";

export function URLPathWidget({ value = "", onChange }: WidgetProps<string>) {
  return (
    <div>
      <InputGroup>
        <InputGroupAddon>{"/"}</InputGroupAddon>
        <InputGroupInput
          value={value?.replace(/^\//, "") ?? ""}
          onChange={(e) =>
            onChange(
              `/${e.target.value.toLowerCase().replace(/[^0-9a-z_/-]/g, "-")}`,
            )
          }
        />
      </InputGroup>
    </div>
  );
}
