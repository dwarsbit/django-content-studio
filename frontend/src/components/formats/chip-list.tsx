import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

// How many chips a list shows before the rest becomes "+N".
export const MAX_CHIPS = 3;

/**
 * Labels as chips: the first three, then "+N" with the rest on hover.
 * Shared by TagFormat and ManyToManyFormat.
 */
export function ChipList({
  labels,
  variant = "secondary",
}: {
  labels: string[];
  variant?: "secondary" | "outline";
}) {
  const { t } = useTranslation();

  if (labels.length === 0) {
    return null;
  }
  const shown = labels.slice(0, MAX_CHIPS);
  const rest = labels.slice(MAX_CHIPS);

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((label, index) => (
        <Badge key={`${label}-${index}`} variant={variant}>
          {label}
        </Badge>
      ))}
      {rest.length > 0 && (
        <Badge variant="outline" title={rest.join(", ")}>
          {t("formats.more", { count: rest.length })}
        </Badge>
      )}
    </span>
  );
}
