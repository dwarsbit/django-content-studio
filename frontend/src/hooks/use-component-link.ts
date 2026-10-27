import { useCallback, useContext } from "react";
import { useFormContext } from "react-hook-form";

import { ResourcePathContext } from "@/components/content-editor/resource-path";
import { useHttp } from "@/hooks/use-http";
import type { FormField, Model } from "@/types";

/**
 * Resolves the URL of a link component (Link, ButtonLink) for the object
 * being edited. The URL is computed by the component's get_url on the
 * server, so it is only fetched when the editor follows or copies it.
 * Returns null for unsaved objects, which have no URL yet.
 */
export function useComponentLink(model: Model, formField: FormField) {
  const http = useHttp();
  const form = useFormContext();
  const id = form.watch("id");
  const resourcePath =
    useContext(ResourcePathContext) ?? `/content/${model.label}`;

  const getLink = useCallback(async () => {
    const { data } = await http.get<{ url: string }>(
      `${resourcePath}${model.admin.is_singleton ? "" : `/${id}`}/components/${formField.component_id}`,
    );

    return data.url;
  }, [
    http,
    resourcePath,
    model.admin.is_singleton,
    id,
    formField.component_id,
  ]);

  return id ? getLink : null;
}
