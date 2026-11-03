import { PiCheckBold, PiMinusBold } from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import type { BooleanFormatOptions } from "@/types";

/**
 * A boolean in a table: a check or a dash, in the text color. Green and
 * red mean status in the admin, and a tick without a word is not one.
 * With labels, a word for each, the false one muted; with colors, the
 * words as badges.
 */
export function BooleanFormat({
  value,
  options,
}: {
  value: unknown;
  options?: Record<string, unknown>;
}) {
  const { labels, colors } = (options ?? {}) as BooleanFormatOptions;
  const index = value ? 0 : 1;

  if (labels) {
    return colors ? (
      <Badge tone={colors[index]}>{labels[index]}</Badge>
    ) : (
      <span className={value ? undefined : "text-muted-foreground"}>
        {labels[index]}
      </span>
    );
  }

  return value ? (
    <PiCheckBold className="size-4" aria-label="✓" />
  ) : (
    <PiMinusBold className="size-4 text-muted-foreground/60" aria-label="–" />
  );
}
