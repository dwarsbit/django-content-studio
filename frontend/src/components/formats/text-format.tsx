import { cn } from "@/lib/utils";
import type { FormatDisplay, TextFormatOptions } from "@/types";

/**
 * The text. On the list page, max_length cuts it and lines clamps it,
 * with the full text on hover; a read-only field shows all of it.
 */
export function TextFormat({
  value,
  emptyValue,
  options,
  display = "cell",
}: {
  value: unknown;
  emptyValue?: string | null;
  options?: Record<string, unknown>;
  display?: FormatDisplay;
}) {
  // 0 and false are values; only a missing or blank value is empty.
  const empty = value === null || value === undefined || value === "";

  if (empty) {
    return <span>{emptyValue ?? ""}</span>;
  }
  const text = String(value);
  const { max_length: maxLength, lines } = (options ?? {}) as TextFormatOptions;

  if (display === "field" || (!maxLength && !lines)) {
    return <span>{text}</span>;
  }
  const characters = [...text];
  const cut =
    maxLength && characters.length > maxLength
      ? `${characters.slice(0, maxLength).join("").trimEnd()}…`
      : text;

  return (
    <span
      title={cut !== text || lines ? text : undefined}
      className={cn(lines && "line-clamp-(--lines) whitespace-normal")}
      style={lines ? ({ "--lines": lines } as React.CSSProperties) : undefined}
    >
      {cut}
    </span>
  );
}
