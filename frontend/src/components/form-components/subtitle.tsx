import { useComponentText } from "@/hooks/use-component-text";
import type { FormField, Model } from "@/types";

/** A Subtitle component: a smaller heading on the edit page. Plain text. */
export function Subtitle({
  model,
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const text = useComponentText(model, formField);

  return text ? (
    <h4 className="text-sm font-semibold text-muted-foreground">{text}</h4>
  ) : null;
}
