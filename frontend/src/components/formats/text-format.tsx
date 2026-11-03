export function TextFormat({
  value,
  emptyValue,
}: {
  value: unknown;
  emptyValue?: string | null;
}) {
  // 0 and false are values; only a missing or blank value is empty.
  const empty = value === null || value === undefined || value === "";

  return <span>{empty ? (emptyValue ?? "") : String(value)}</span>;
}
