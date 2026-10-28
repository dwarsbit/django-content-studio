import React, { useContext } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { ActivityLog } from "@/components/form-components/activity-log";
import { ComponentButton } from "@/components/form-components/button";
import { Link } from "@/components/form-components/link";
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
import { useAdminInfo } from "@/hooks/use-admin-info";
import { cn } from "@/lib/utils";
import { FieldWidget, type FormField as IFormField, type Model } from "@/types";

import { EditorReadOnlyContext } from "./editor-read-only";
import { UniqueWarning } from "./unique-warning";

const COMPONENTS: Partial<
  Record<
    IFormField["component_type"],
    React.ComponentType<{
      model: Model;
      formField: IFormField;
    }>
  >
> = {
  Link,
  LinkButton,
  Button: ComponentButton,
  ActivityLog,
};

export function FormField({
  formField,
  model,
}: {
  formField: IFormField;
  model: Model;
}) {
  const form = useFormContext();
  const { data: info } = useAdminInfo();
  const modelField = model.fields[formField.name];
  const label = formField.label || modelField?.verbose_name;
  // The studio's read-only fields travel with the form values: the
  // create form starts from the studio's list, a saved object brings
  // its own.
  const readonlyFields = useWatch({ name: "__readonly_fields__" }) as
    string[] | undefined;
  const editorReadOnly = useContext(EditorReadOnlyContext);
  const isReadonly =
    editorReadOnly ||
    !modelField ||
    modelField.readonly ||
    formField.readonly ||
    (readonlyFields?.includes(formField.name) ?? false);

  // Checkboxes render their label inline after the box, not above it.
  const widgetClass =
    formField.widget ??
    modelField?.widget_class ??
    info?.widgets[modelField?.type ?? ""]?.name;
  const isCheckbox =
    !isReadonly &&
    modelField !== undefined &&
    widgetClass === FieldWidget.CheckboxWidget;
  // The label toggles checkbox- and switch-based controls through its
  // htmlFor association, so it reads as clickable.
  const labelToggles =
    !isReadonly &&
    (widgetClass === FieldWidget.CheckboxWidget ||
      widgetClass === FieldWidget.SwitchWidget);

  return (
    <div>
      {formField.type === "field" ? (
        <RootFormField
          control={form.control}
          name={formField.name}
          render={({ field }) => {
            // The label's text, capitalized; a required field gets a mark
            // through CSS so the label's text stays the field's name.
            const labelText = (
              <span
                className={cn(
                  "first-letter:uppercase",
                  !isReadonly &&
                    !labelToggles &&
                    modelField?.required &&
                    "after:content-['_*'] after:text-muted-foreground after:font-normal",
                )}
              >
                {label}
              </span>
            );
            const control = isReadonly ? (
              <div className="min-h-9 flex items-center px-3 rounded-md border border-dashed bg-muted/40 text-muted-foreground cursor-default">
                <FormatRenderer value={field.value} field={modelField} />
              </div>
            ) : (
              <FormControl>
                <WidgetRenderer
                  model={model}
                  {...field}
                  widgetClass={formField.widget}
                />
              </FormControl>
            );

            return (
              <FormItem className={isCheckbox ? "gap-1" : undefined}>
                {isCheckbox ? (
                  // The box, then the label with the help text under it.
                  <div className="flex items-start gap-2.5 [&>[role=checkbox]]:mt-0.5">
                    {control}
                    <div className="min-w-0">
                      <FormLabel className="cursor-pointer text-foreground">
                        {labelText}
                      </FormLabel>
                      {modelField?.help_text && (
                        <FormDescription className="mt-0.5 text-xs">
                          {modelField.help_text}
                        </FormDescription>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <FormLabel
                      className={cn(
                        "text-foreground",
                        labelToggles && "cursor-pointer",
                      )}
                    >
                      {labelText}
                    </FormLabel>
                    {control}
                  </>
                )}
                {!isReadonly && modelField?.unique && (
                  <UniqueWarning model={model} name={formField.name} />
                )}
                {!isCheckbox && modelField?.help_text && (
                  <FormDescription className="text-xs">
                    {modelField.help_text}
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />
      ) : (
        <div>
          <ComponentRenderer formField={formField} model={model} />
        </div>
      )}
    </div>
  );
}

/**
 * Renders a component (Link, LinkButton, Button, ActivityLog) of the
 * edit page, in a form set or in the header.
 */
export function ComponentRenderer({
  formField,
  model,
}: {
  formField: IFormField;
  model: Model;
}) {
  const Component = COMPONENTS[formField.component_type];

  return Component
    ? React.createElement(Component, { formField, model })
    : null;
}
