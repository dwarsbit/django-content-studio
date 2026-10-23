import { useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { slugify } from "@/lib/slug";
import type { Model } from "@/types";

// The text a source field contributes: relations count with their
// display name, like the selected option in the classic admin.
function sourceText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object" && "__str__" in value) {
    return String(value.__str__ ?? "");
  }

  return "";
}

/**
 * Fills the studio's prepopulated fields from their source fields while
 * an object is created. Like the classic admin, a field stops following
 * its sources once it is edited by hand, and existing objects are never
 * prepopulated.
 */
export function Prepopulate({
  model,
  fields,
}: {
  model: Model;
  fields: Record<string, string[]>;
}) {
  const id = useWatch({ name: "id" });

  if (id != null) {
    return null;
  }

  return Object.entries(fields).map(([target, sources]) => (
    <PrepopulatedField
      key={target}
      target={target}
      sources={sources}
      maxLength={model.fields[target]?.max_length}
    />
  ));
}

function PrepopulatedField({
  target,
  sources,
  maxLength,
}: {
  target: string;
  sources: string[];
  maxLength?: number;
}) {
  const form = useFormContext();
  const values = useWatch({ name: sources }) as unknown[];
  // The value this component last filled in: a different value means
  // the field was edited by hand.
  const filledIn = useRef<unknown>(form.getValues(target) ?? "");
  const text = values.map(sourceText).filter(Boolean).join(" ");

  useEffect(() => {
    const current = form.getValues(target) ?? "";

    if (current !== filledIn.current) {
      return;
    }

    const value = slugify(text, maxLength);

    if (value !== current) {
      filledIn.current = value;
      form.setValue(target, value, { shouldDirty: true, shouldValidate: true });
    }
  }, [form, target, text, maxLength]);

  return null;
}
