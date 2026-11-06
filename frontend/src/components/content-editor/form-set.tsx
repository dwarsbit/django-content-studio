import * as R from "ramda";

import { useConditions } from "@/hooks/use-conditions";
import type {
  FormField as IFormField,
  FormLayout,
  FormSet,
  Model,
} from "@/types";

import { Conditional } from "./conditional";
import { useResetInvalidInput } from "./conditional-fields";
import { FormField } from "./form-field";

export function FormSet({
  formSet,
  model,
  hiddenFields = [],
}: {
  formSet: FormSet;
  model: Model;
  hiddenFields?: string[];
}) {
  return (
    <div>
      {(formSet.title || formSet.description) && (
        <div className="px-5 py-3 border-b">
          {formSet.title && (
            <h4 className="font-semibold first-letter:uppercase">
              {formSet.title}
            </h4>
          )}
          {formSet.description ? (
            <div className="text-xs text-muted-foreground">
              {formSet.description}
            </div>
          ) : null}
        </div>
      )}
      <div className="p-5 space-y-5">
        {formSet.fields.map((formField, idx) =>
          R.has("fields", formField) ? (
            <LayoutRow
              key={idx}
              layout={formField}
              model={model}
              hiddenFields={hiddenFields}
            />
          ) : (
            !hiddenFields.includes(formField.name) && (
              <Conditional
                key={idx}
                when={formField.when}
                fields={formField.type === "field" ? [formField.name] : []}
              >
                <FormField formField={formField} model={model} />
              </Conditional>
            )
          ),
        )}
      </div>
    </div>
  );
}

/**
 * A FieldLayout row: its fields side by side. A field hidden by its
 * condition gives its column to the others; a row without shown fields
 * is left out.
 */
function LayoutRow({
  layout,
  model,
  hiddenFields,
}: {
  layout: FormLayout;
  model: Model;
  hiddenFields: string[];
}) {
  const fields = layout.fields.filter((f) => !hiddenFields.includes(f.name));
  const shown = useConditions(fields.map((f) => f.when));
  const visible = fields.filter((_, idx) => shown[idx]);

  useResetInvalidInput(
    fields
      .filter((f, idx) => !shown[idx] && f.type === "field")
      .map((f) => f.name),
  );

  return (
    visible.length > 0 && (
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${visible.length}, 1fr)`,
        }}
      >
        {visible.map((innerFormField: IFormField) => (
          <FormField
            key={innerFormField.name}
            formField={innerFormField}
            model={model}
          />
        ))}
      </div>
    )
  );
}
