import { useCondition } from "@/hooks/use-conditions";
import type { ConditionTree } from "@/types";

import { useResetInvalidInput } from "./conditional-fields";

/**
 * Renders its children only while the condition (`when=`) holds.
 *
 * A hidden field is not saved: the server keeps its stored value. So
 * input that cannot be saved (an InvalidInput) in the fields it hides
 * goes back to the stored value, instead of blocking Save on a field
 * the editor cannot see.
 */
export function Conditional({
  when,
  fields = [],
  children,
}: {
  when?: ConditionTree | null;
  // The form fields inside, by name.
  fields?: string[];
  children: React.ReactNode;
}) {
  return when ? (
    <ConditionalContent when={when} fields={fields}>
      {children}
    </ConditionalContent>
  ) : (
    children
  );
}

function ConditionalContent({
  when,
  fields,
  children,
}: {
  when: ConditionTree;
  fields: string[];
  children: React.ReactNode;
}) {
  const shown = useCondition(when);

  useResetInvalidInput(shown ? [] : fields);

  return shown ? children : null;
}
