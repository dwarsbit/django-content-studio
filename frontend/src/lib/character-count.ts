import type { CharacterCountOptions } from "@/types";

// Unset show_count: the counter shows from this share of the limit.
const NEAR_LIMIT = 0.8;

/** The number of characters as Django counts them (code points). */
export function countCharacters(text: string): number {
  return [...text].length;
}

/**
 * Whether a text field shows its counter: show_count when set, else
 * once the text reaches 80% of its limit (recommended_length, or the
 * field's max_length).
 */
export function showsCount(
  length: number,
  maxLength: number | undefined,
  {
    show_count: showCount,
    recommended_length: recommended,
  }: CharacterCountOptions,
): boolean {
  if (showCount !== undefined) {
    return showCount;
  }
  const limit = recommended ?? maxLength;

  return limit !== undefined && length >= limit * NEAR_LIMIT;
}
