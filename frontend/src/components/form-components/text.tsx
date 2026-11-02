import { MarkdownText } from "@/components/markdown";
import { useComponentText } from "@/hooks/use-component-text";
import type { FormField, Model } from "@/types";

/** A Text component: a paragraph on the edit page, in Markdown. */
export function Text({
  model,
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const text = useComponentText(model, formField);

  return text ? (
    <MarkdownText className="text-muted-foreground">{text}</MarkdownText>
  ) : null;
}
