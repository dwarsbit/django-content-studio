import { InvalidInput } from "@/lib/invalid-input";

/** A JSON value as indented text; empty text is null. */
export function formatJSON(value: unknown): string {
  return value === null || value === undefined
    ? ""
    : JSON.stringify(value, null, 2);
}

/**
 * The parsed text, or null for empty text; text that does not parse
 * gives an InvalidInput, which keeps the form from saving it.
 */
export function parseJSON(text: string, invalidMessage: string): unknown {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return new InvalidInput(text, invalidMessage);
  }
}

/**
 * The rows as a dict of strings. Blank rows are left out; a key that
 * is empty or used twice gives an InvalidInput, which keeps the form
 * from saving.
 */
export function rowsToValue(
  rows: { key: string; value: string }[],
  messages: { emptyKey: string; duplicateKey(key: string): string },
): Record<string, string> | InvalidInput {
  const filled = rows.filter((r) => r.key.trim() || r.value.trim());
  const text = JSON.stringify(filled.map((r) => [r.key, r.value]));
  const keys = filled.map((r) => r.key.trim());

  if (keys.some((key) => !key)) {
    return new InvalidInput(text, messages.emptyKey);
  }

  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);

  if (duplicate !== undefined) {
    return new InvalidInput(text, messages.duplicateKey(duplicate));
  }

  return Object.fromEntries(filled.map((r) => [r.key.trim(), r.value]));
}

/** The rows as a list of strings, without the blank ones. */
export function rowsToList(rows: { value: string }[]): string[] {
  return rows.map((r) => r.value).filter((item) => item.trim() !== "");
}
