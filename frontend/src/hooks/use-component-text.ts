import { useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { useFormContext } from "react-hook-form";

import { ResourcePathContext } from "@/components/content-editor/resource-path";
import { useHttp } from "@/hooks/use-http";
import type { FormField, Model } from "@/types";

/**
 * The text of a text component (Title, Subtitle, Text, Callout). Static
 * text comes with the form layout; per-object text is computed by the
 * component's get_text on the server and fetched for the saved object,
 * so it is null on the create form and while it loads.
 */
export function useComponentText(
  model: Model,
  formField: FormField,
): string | null {
  const http = useHttp();
  const form = useFormContext();
  const id = form.watch("id");
  const resourcePath =
    useContext(ResourcePathContext) ?? `/content/${model.label}`;
  const path = `${resourcePath}${model.admin.is_singleton ? "" : `/${id}`}/components/${formField.component_id}`;
  const perObject = Boolean(formField.per_object);

  const { data } = useQuery({
    enabled: perObject && Boolean(id),
    retry: false,
    // Under "resources" so saving the object refreshes the text.
    queryKey: ["resources", model.label, "component-text", path],
    async queryFn() {
      const { data } = await http.get<{ text: string | null }>(path);

      return data.text;
    },
  });

  if (!perObject) {
    return formField.text ?? null;
  }

  return id ? (data ?? null) : null;
}
