import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useContext } from "react";
import { useFormContext } from "react-hook-form";

import { ResourcePathContext } from "@/components/content-editor/resource-path";
import { Button } from "@/components/ui/button";
import { useHttp } from "@/hooks/use-http";
import { useRunButton } from "@/hooks/use-run-button";
import { cn } from "@/lib/utils";
import type { ButtonResult, FormField, Model, Resource } from "@/types";

/**
 * A Button component: runs the button's handle() on the server for the
 * object being edited. Whether the editor sees it is decided per object
 * by the server; unsaved objects show no buttons. After a run the
 * object and its inlines are fetched again; the form takes the new
 * values when it has no unsaved changes.
 */
export function ComponentButton({
  model,
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const http = useHttp();
  const queryClient = useQueryClient();
  const form = useFormContext();
  const id = form.watch("id");
  const resourcePath =
    useContext(ResourcePathContext) ?? `/content/${model.label}`;
  const objectPath = `${resourcePath}${model.admin.is_singleton ? "" : `/${id}`}`;
  const path = `${objectPath}/components/${formField.component_id}`;

  const { data: state } = useQuery({
    enabled: !!id,
    queryKey: ["components", model.label, path],
    async queryFn() {
      const { data } = await http.get<{ visible: boolean }>(path);

      return data;
    },
  });

  const run = useCallback(async () => {
    const { data } = await http.post<ButtonResult>(`${path}/run`);

    return data;
  }, [http, path]);

  const { trigger, isPending } = useRunButton({
    confirm: formField.confirm,
    run,
    async onDone() {
      // The button may have changed the object: show its new values,
      // unless that would discard the editor's unsaved changes.
      if (!form.formState.isDirty) {
        const { data } = await http.get<Resource>(objectPath);

        form.reset({
          ...data,
          id: data.id != null ? String(data.id) : data.id,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: ["resources", model.label],
      });
      await queryClient.invalidateQueries({
        queryKey: ["components", model.label],
      });
    },
  });

  return (
    <>
      {id && state?.visible && (
        <Button
          variant={formField.destructive ? "destructive" : "outline"}
          isLoading={isPending}
          onClick={trigger}
        >
          {formField.icon && (
            <span className={cn(formField.icon, "text-[14px]")} />
          )}
          {formField.label}
        </Button>
      )}
    </>
  );
}
