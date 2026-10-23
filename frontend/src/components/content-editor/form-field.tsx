import React from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { ActivityLog } from "@/components/form-components/activity-log";
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
import { FieldWidget, type FormField as IFormField, type Model } from "@/types";

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
  const isReadonly =
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
            const control = isReadonly ? (
              <div className="min-h-8 flex items-center pl-3 bg-accent rounded-md cursor-default">
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
                  <div className="flex items-center gap-2">
                    {control}
                    <FormLabel className="cursor-pointer">{label}</FormLabel>
                  </div>
                ) : (
                  <>
                    <FormLabel
                      className={labelToggles ? "cursor-pointer" : undefined}
                    >
                      {label}
                    </FormLabel>
                    {control}
                  </>
                )}
                {!isReadonly && modelField?.unique && (
                  <UniqueWarning model={model} name={formField.name} />
                )}
                {modelField?.help_text && (
                  <FormDescription>{modelField.help_text}</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />
      ) : (
        <div>
          {(() => {
            const Component = COMPONENTS[formField.component_type];
            return (
              Component && React.createElement(Component, { formField, model })
            );
          })()}
        </div>
      )}
    </div>
  );
}
