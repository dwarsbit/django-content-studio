import { useComponentText } from "@/hooks/use-component-text";
import type { FormField, Model } from "@/types";

/** A Title component: a heading on the edit page. Plain text. */
export function Title({
  model,
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const text = useComponentText(model, formField);

  return text ? <h3 className="text-md font-semibold">{text}</h3> : null;
}
