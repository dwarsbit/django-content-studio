/** The label of a related object as the admin sends it ({id, __str__}). */
export function relatedLabel(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return String(value);
  }
  if (!("__str__" in value)) {
    return "id" in value ? String(value.id) : String(value);
  }
  const str = value.__str__;
  return str === null || str === undefined ? String(value) : String(str);
}
