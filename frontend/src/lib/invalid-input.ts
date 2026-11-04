import { z } from "zod";

/**
 * A widget's value that cannot be saved as it stands, such as JSON
 * that does not parse or a key used twice. The form schema
 * (contentFormSchema) refuses it, so Save shows the message on the
 * field instead of sending the value.
 */
export class InvalidInput {
  constructor(
    // What the editor typed, so the widget can show it again.
    readonly text: string,
    readonly message: string,
  ) {}
}

/** The first invalid input inside a value, in blocks and lists too. */
export function findInvalidInput(value: unknown): InvalidInput | null {
  if (value instanceof InvalidInput) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInvalidInput(item);
      if (found) return found;
    }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findInvalidInput(item);
      if (found) return found;
    }
  }

  return null;
}

/** The content editor's form schema: any fields, none invalid. */
export const contentFormSchema = z
  .looseObject({
    id: z.string().readonly().optional(),
    __str__: z.string().readonly().optional(),
  })
  .superRefine((values, ctx) => {
    for (const [key, value] of Object.entries(values)) {
      const invalid = findInvalidInput(value);

      if (invalid) {
        ctx.addIssue({ code: "custom", path: [key], message: invalid.message });
      }
    }
  });
