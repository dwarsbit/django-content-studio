import React from "react";
import { useFormContext } from "react-hook-form";

import { LinkButton } from "@/components/form-components/link-button";
import { FormatRenderer } from "@/components/formats/renderer";
import {
  FormControl,
  FormDescription,
  FormField as RootFormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { WidgetRenderer } from "@/components/widgets/renderer";
import type { FormField as IFormField, Model } from "@/types";

const COMPONENTS = {
  LinkButton,
};

export function FormField({
  formField,
  model,
}: {
  formField: IFormField;
  model: Model;
}) {
  const form = useFormContext();
  const modelField = model.fields[formField.name];

  return (
    <div>
      {formField.type === "field" ? (
        <RootFormField
          control={form.control}
          name={formField.name}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {formField.label || modelField?.verbose_name}
              </FormLabel>
              {!modelField || modelField.readonly || formField.readonly ? (
                <div className="min-h-8 flex items-center pl-3 bg-accent rounded-md cursor-default">
                  <FormatRenderer value={field.value} field={modelField} />
                </div>
              ) : (
                <FormControl>
                  <WidgetRenderer model={model} {...field} />
                </FormControl>
              )}
              {modelField?.help_text && (
                <FormDescription>{modelField.help_text}</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div>
          {COMPONENTS[formField.component_type] &&
            React.createElement(COMPONENTS[formField.component_type], {
              formField,
              model,
            })}
        </div>
      )}
    </div>
  );
}
