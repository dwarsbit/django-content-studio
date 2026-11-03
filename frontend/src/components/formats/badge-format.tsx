import { Badge } from "@/components/ui/badge";
import type { BadgeColor, BadgeFormatOptions, ModelField } from "@/types";

/**
 * A value as a colored badge, with its choice's label; a list of
 * values (a multiple choice field) as one badge each.
 */
export function BadgeFormat({
  value,
  field,
  emptyValue,
  options,
}: {
  value: unknown;
  field?: ModelField;
  emptyValue?: string | null;
  options?: Record<string, unknown>;
}) {
  const { colors = {}, default_color = "gray" } = (options ??
    {}) as BadgeFormatOptions;
  const values = (Array.isArray(value) ? value : [value]).filter(
    (item) => item !== null && item !== undefined && item !== "",
  );

  if (values.length === 0) {
    return <span>{emptyValue ?? ""}</span>;
  }
  const label = (item: unknown) =>
    field?.choices?.find(([key]) => String(key) === String(item))?.[1] ??
    String(item);
  const tone = (item: unknown): BadgeColor =>
    colors[String(item)] ?? default_color;

  return (
    <span className="inline-flex flex-wrap gap-1">
      {values.map((item, index) => (
        <Badge key={`${String(item)}-${index}`} tone={tone(item)}>
          {label(item)}
        </Badge>
      ))}
    </span>
  );
}
