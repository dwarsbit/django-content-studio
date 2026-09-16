import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as R from "ramda";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { TenantInfo } from "@/components/tenant-info";
import { Form } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import type { Model, Resource } from "@/types";

import { Aside } from "./aside";
import { Header } from "./header";
import { Main } from "./main";

export function Editor({
  modelLabel,
  ...props
}: {
  modelLabel: string;
  id?: string | null;
  initialValues?: Record<string, any>;
  onSave: VoidFunction;
  onClose: VoidFunction;
  onDelete?: VoidFunction;
}) {
  const { data: discover } = useDiscover();
  const model = discover?.models.find(R.whereEq({ label: modelLabel }));

  return model ? <EditorForm model={model} {...props} /> : null;
}

function EditorForm({
  model,
  id,
  initialValues = {},
  onDelete,
  onSave,
  onClose,
}: {
  model: Model;
  id?: string | null;
  initialValues?: Record<string, any>;
  onSave: VoidFunction;
  onClose: VoidFunction;
  onDelete?: VoidFunction;
}) {
  const queryClient = useQueryClient();
  const http = useHttp();
  const { t } = useTranslation();
  const modelLabel = model.label;
  const isSingleton = model?.admin.is_singleton ?? false;
  const [initialized, setInitialized] = useState(R.isNil(id) && !isSingleton);
  const hiddenFields = Object.keys(initialValues);
  const defaultValues = Object.entries(model?.fields ?? {}).reduce(
    (defaults, [key, field]) => ({ ...defaults, [key]: field.default }),
    {},
  );

  const formSchema = z.looseObject({
    id: z.string().readonly().optional(),
    __str__: z.string().readonly().optional(),
  });
  const form = useForm<Partial<Resource>>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: R.mergeDeepLeft(initialValues, defaultValues),
  });

  const { data: resource } = useQuery({
    enabled: !R.isNil(id) || isSingleton,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryKey: ["resources", modelLabel, id || isSingleton],
    async queryFn() {
      try {
        const { data } = await http.get(
          `/content/${modelLabel}${isSingleton ? "" : `/${id}`}`,
        );
        if (!initialized) {
          form.reset(data);
        }
        return data;
      } catch (e: unknown) {
        throw Error(e);
      } finally {
        setInitialized(true);
      }
    },
  });

  const { mutateAsync: save, isPending } = useMutation({
    async mutationFn(values: Partial<Resource>) {
      await http[values.id ? "put" : "post"](
        `/content/${modelLabel}${values.id ? `/${values.id}` : ""}`,
        values,
      );
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["resources", modelLabel],
      });
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await save(values);
    } catch (e: unknown) {
      const errors = Object.entries(e.response.data);

      toast.error(
        <div>
          <div>{t("editor.field_validation_error_title")}</div>
          <div className="font-normal text-muted-foreground">
            {t("editor.field_validation_error_description")}
          </div>
        </div>,
      );

      for (const [key, error] of errors) {
        form.setError(key, { type: "custom", message: error[0] ?? "" });
      }
      throw e;
    }
  }

  return model && initialized ? (
    <Form {...form}>
      <div className="flex-1 flex flex-col overflow-hidden">
        <TenantInfo label={model.label} />
        <Header
          model={model}
          resource={resource}
          isSaving={isPending}
          onSave={async () => {
            await form.handleSubmit(onSubmit)();
            onSave?.();
          }}
          onDelete={onDelete}
          onClose={onClose}
        />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1  border-r overflow-y-auto scrollbar bg-muted">
            <div className="w-full max-w-2xl mx-auto">
              <div className="p-4">
                <Main model={model} id={id} hiddenFields={hiddenFields} />
              </div>
            </div>
          </div>
          <div className="overflow-y-auto scrollbar shrink-0 w-[280px]">
            <Aside model={model} hiddenFields={hiddenFields} />
          </div>
        </div>
      </div>
    </Form>
  ) : (
    <div className="py-12 sm:py-24 md:py-48 flex items-center justify-center">
      <Spinner />
    </div>
  );
}
