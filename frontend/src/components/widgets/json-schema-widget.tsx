import * as R from "ramda";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ModelField, WidgetProps } from "@/types";

export function JSONSchemaWidget({
  value,
  onChange,
  field,
}: {
  field: ModelField;
} & WidgetProps<Record<string, unknown>>) {
  const schema = field.json_schema ?? {};

  return schema.type === "object" ? (
    <div className="space-y-3">
      {Object.entries(schema.properties ?? {}).map(([key, props]) => (
        <div key={key}>
          <Label className="font-normal mb-1.5">{props.verbose_name}</Label>
          <Input
            key={key}
            value={
              typeof value?.[key] === "string" ||
              typeof value?.[key] === "number"
                ? value?.[key]
                : ""
            }
            onChange={(e) => onChange(R.assoc(key, e.target.value, value))}
          />
        </div>
      ))}
    </div>
  ) : (
    <div className="text-sm text-amber-500">
      Schema root type has to be object
    </div>
  );
}
