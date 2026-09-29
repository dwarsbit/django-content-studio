import { Badge } from "@/components/ui/badge";
import type { ModelField } from "@/types";

export function ChoiceFormat({
  value,
  field,
}: {
  value: unknown;
  field?: ModelField;
}) {
  const label = (i: unknown) =>
    field?.choices?.find(([key]) => i === key)?.[1] ?? String(i);

  return (
    <div className="flex gap-1 flex-wrap">
      {Array.isArray(value) ? (
        value.map((i) => (
          <Badge key={i} variant="secondary">
            {label(i)}
          </Badge>
        ))
      ) : (
        <Badge variant="secondary">{label(value)}</Badge>
      )}
    </div>
  );
}
