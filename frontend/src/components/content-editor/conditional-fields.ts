import { useEffect } from "react";
import { useFormContext } from "react-hook-form";

import { findInvalidInput } from "@/lib/invalid-input";
import type { FormField, FormLayout, FormSet } from "@/types";

/**
 * Puts hidden fields holding input that cannot be saved (an
 * InvalidInput) back to their stored values.
 */
export function useResetInvalidInput(hidden: string[]) {
  const form = useFormContext();
  const names = hidden.join("\n");

  useEffect(() => {
    if (!names) {
      return;
    }

    for (const name of names.split("\n")) {
      if (findInvalidInput(form.getValues(name))) {
        form.resetField(name);
      }
    }
  }, [names, form]);
}

/** The names of the form fields in form set entries. */
export function fieldNames(
  entries: (FormField | FormLayout | FormSet)[],
): string[] {
  return entries.flatMap((entry) => {
    if ("fields" in entry) {
      return fieldNames(entry.fields);
    }

    return entry.type === "field" ? [entry.name] : [];
  });
}
