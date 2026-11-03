import { parseColor } from "@/lib/colors";

/**
 * A color in a table: a swatch with the value. A value that is not a
 * color is shown as text, without a swatch.
 */
export function ColorFormat({
  value,
  emptyValue,
}: {
  value: unknown;
  emptyValue?: string | null;
}) {
  if (!value) {
    return <span>{emptyValue ?? ""}</span>;
  }
  const text = String(value);

  return (
    <span className="inline-flex items-center gap-2">
      {parseColor(text) && (
        <span
          aria-hidden
          data-slot="color-swatch"
          className="relative size-4 shrink-0 overflow-hidden rounded-sm border border-border bg-[conic-gradient(var(--muted)_25%,var(--background)_0_50%,var(--muted)_0_75%,var(--background)_0)] bg-size-[8px_8px]"
        >
          <span className="absolute inset-0" style={{ background: text }} />
        </span>
      )}
      <span>{text}</span>
    </span>
  );
}
