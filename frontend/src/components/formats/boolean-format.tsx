import { PiCheckBold, PiMinusBold } from "react-icons/pi";

/**
 * A boolean in a table: a check or a dash, in the text color. Green and
 * red mean status in the admin, and a tick without a word is not one.
 */
export function BooleanFormat({ value }: { value: unknown }) {
  return value ? (
    <PiCheckBold className="size-4" aria-label="✓" />
  ) : (
    <PiMinusBold className="size-4 text-muted-foreground/60" aria-label="–" />
  );
}
