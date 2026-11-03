import { countCharacters, showsCount } from "@/lib/character-count";
import { cn } from "@/lib/utils";
import type { CharacterCountOptions } from "@/types";

/**
 * "42 / 60" under a text field: the warning color past
 * recommended_length, the destructive color past max_length.
 */
export function CharacterCount({
  value,
  maxLength,
  options,
}: {
  value: unknown;
  maxLength?: number;
  options: CharacterCountOptions;
}) {
  // Number fields use the InputWidget too: their value can be a number.
  const length = countCharacters(value == null ? "" : String(value));
  const recommended = options.recommended_length;

  if (!showsCount(length, maxLength, options)) {
    return null;
  }
  const limit = recommended ?? maxLength;
  const isOverMax = maxLength !== undefined && length > maxLength;
  const isOverRecommended = recommended !== undefined && length > recommended;

  return (
    <div
      data-testid="character-count"
      className={cn(
        "mt-1 text-right text-xs tabular-nums text-muted-foreground select-none",
        {
          "text-warning": isOverRecommended && !isOverMax,
          "text-destructive": isOverMax,
        },
      )}
    >
      {limit === undefined ? length : `${length} / ${limit}`}
    </div>
  );
}
