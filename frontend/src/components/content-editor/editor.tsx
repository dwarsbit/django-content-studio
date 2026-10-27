import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import * as R from "ramda";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type Blocker, useBlocker } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { TenantInfo } from "@/components/tenant-info";
import { Form } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { useShowResult } from "@/hooks/use-show-result";
import { type ServerErrors, setServerErrors } from "@/lib/server-errors";
import { getErrorMessage } from "@/lib/utils";
import type { ButtonResult, FormField, Model, Resource } from "@/types";

import { Aside } from "./aside";
import { EditorReadOnlyContext } from "./editor-read-only";
import { Header } from "./header";
import { Main } from "./main";
import { Prepopulate } from "./prepopulate";
import { ResourcePathContext } from "./resource-path";

export function Editor({
  modelLabel,
  dialog = false,
  ...props
}: {
  modelLabel: string;
  // Whether the editor renders inside a Dialog (inline creation). Routed
  // editors get the navigation guard and a plain page title instead.
  dialog?: boolean;
  id?: string | null;
  inlineOf?: string;
  initialValues?: Record<string, unknown>;
  // The create form's prepopulated fields; defaults to the model's
  // studio (inlines pass their own).
  prepopulatedFields?: Record<string, string[]>;
  // The header's components; defaults to the model's studio (inline
  // rows pass their inline's).
  headerComponents?: FormField[];
  // Show the object without saving: every field read-only.
  readOnly?: boolean;
  canDelete?: boolean;
  onCreated?: (id: string) => void;
  onSave?: VoidFunction;
  onClose?: VoidFunction;
  onDelete?: VoidFunction;
}) {
  const { data: discover } = useDiscover();
  const model = discover?.models.find(R.whereEq({ label: modelLabel }));

  return model ? <EditorForm model={model} dialog={dialog} {...props} /> : null;
}

function EditorForm({
  model,
  id,
  inlineOf,
  dialog = false,
  initialValues = {},
  prepopulatedFields,
  headerComponents,
  readOnly = false,
  canDelete,
  onCreated,
  onDelete,
  onSave,
  onClose,
}: {
  model: Model;
  id?: string | null;
  inlineOf?: string;
  dialog?: boolean;
  initialValues?: Record<string, unknown>;
  // The create form's prepopulated fields; defaults to the model's
  // studio (inlines pass their own).
  prepopulatedFields?: Record<string, string[]>;
  // The header's components; defaults to the model's studio (inline
  // rows pass their inline's).
  headerComponents?: FormField[];
  // Show the object without saving: every field read-only.
  readOnly?: boolean;
  canDelete?: boolean;
  onCreated?: (id: string) => void;
  onSave?: VoidFunction;
  onClose?: VoidFunction;
  onDelete?: VoidFunction;
}) {
  const queryClient = useQueryClient();
  const http = useHttp();
  const { t } = useTranslation();
  const confirm = useConfirmDialog();
  const showResult = useShowResult();
  const modelLabel = model.label;
  const isSingleton = model?.admin.is_singleton ?? false;
  // Inline models are managed through the inline endpoints of their parent,
  // not the content endpoints (which only exist for registered models).
  const resourcePath = inlineOf
    ? `/inlines/${inlineOf}/${modelLabel}`
    : `/content/${modelLabel}`;
  const [initialized, setInitialized] = useState(R.isNil(id) && !isSingleton);
  const hiddenFields = Object.keys(initialValues);
  const defaultValues = Object.entries(model?.fields ?? {}).reduce(
    (defaults, [key, field]) => ({ ...defaults, [key]: field.default }),
    {
      __readonly_fields__: model?.admin?.edit.readonly_fields ?? [],
    } as Record<string, unknown>,
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

  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- `initialized` is deliberately not part of the queryKey: the queryFn flips it, so including it would invalidate the entry on every fetch
  const { data: resource } = useQuery({
    enabled: !R.isNil(id) || isSingleton,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryKey: ["resources", modelLabel, id || isSingleton],
    async queryFn() {
      try {
        const { data } = await http.get(
          `${resourcePath}${isSingleton ? "" : `/${id}`}`,
        );
        if (!initialized) {
          // The API serializes integer primary keys as JSON numbers; the
          // form schema (and the rest of the app) treats ids as strings.
          form.reset({
            ...data,
            id: data.id != null ? String(data.id) : data.id,
          });
        }
        return data;
      } catch (e: unknown) {
        throw new Error(getErrorMessage(e), { cause: e });
      } finally {
        setInitialized(true);
      }
    },
  });

  // Routed editors guard dirty forms: route navigation (the browser back
  // button, menu clicks) is blocked until confirmed, and a reload gets
  // the browser's own prompt. Dialog editors (inline creation) confirm
  // on their close button instead.
  //
  // The blocker reads isDirty from the last render, but a successful
  // save resets the form in the same tick as the navigation it
  // triggers — before React re-renders. A one-shot flag lets exactly
  // that navigation through.
  const isDirty = form.formState.isDirty;
  const allowNextNavigation = useRef(false);
  const blocker = useBlocker(
    dialog
      ? () => false
      : () => {
          const allowed = allowNextNavigation.current;
          allowNextNavigation.current = false;
          return !allowed && form.formState.isDirty;
        },
  );
  const promptedBlocker = useRef<Blocker | null>(null);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      promptedBlocker.current = null;
      return;
    }

    // The effect runs on every render; ask once per blocked navigation.
    if (promptedBlocker.current === blocker) {
      return;
    }

    promptedBlocker.current = blocker;

    confirm({ description: t("editor.unsaved_alert") }).then((confirmed) => {
      if (confirmed) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    });
  });

  useEffect(() => {
    if (dialog) {
      return;
    }

    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handler);

    return () => window.removeEventListener("beforeunload", handler);
  }, [dialog, isDirty]);

  const { mutateAsync: save, isPending } = useMutation({
    async mutationFn(values: Partial<Resource>) {
      const { data } = await http[values.id ? "put" : "post"]<Resource>(
        `${resourcePath}${values.id ? `/${values.id}` : ""}`,
        values,
      );

      return data;
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["resources", modelLabel],
      });
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const { __result__: result, ...saved } = (await save(
        values,
      )) as Resource & {
        __result__?: ButtonResult;
      };

      // What the studio's get_created_result reports, shown once.
      if (result) {
        showResult(result);
      }

      // The saved data becomes the form's new baseline: the form is
      // pristine again, and a create learns its id for later saves.
      const savedId = saved?.id != null ? String(saved.id) : values.id;
      form.reset({ ...values, ...saved, id: savedId });

      if (!values.id && savedId != null) {
        // The navigation this triggers must pass the guard despite the
        // stale dirty state from the last render.
        allowNextNavigation.current = true;
        onCreated?.(String(savedId));
      }
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response) {
        const errors = Object.entries(
          e.response.data as Record<string, ServerErrors>,
        );
        toast.error(
          <div>
            <div>{t("editor.field_validation_error_title")}</div>
            <div className="font-normal text-muted-foreground">
              {t("editor.field_validation_error_description")}
            </div>
          </div>,
        );

        for (const [key, error] of errors) {
          setServerErrors(form.setError, key, error);
        }
      }
      throw e;
    }
  }

  return model && initialized ? (
    <Form {...form}>
      <ResourcePathContext value={resourcePath}>
        <EditorReadOnlyContext value={readOnly}>
          <Prepopulate
            model={model}
            fields={
              prepopulatedFields ?? model.admin?.edit.prepopulated_fields ?? {}
            }
          />
          <div className="flex-1 flex flex-col overflow-hidden max-w-[1200px] mx-auto w-full">
            <TenantInfo label={model.label} />
            <Header
              model={model}
              resource={resource}
              resourcePath={resourcePath}
              isSaving={isPending}
              dialog={dialog}
              components={headerComponents}
              readOnly={readOnly}
              canDelete={canDelete}
              onSave={async () => {
                await form.handleSubmit(onSubmit)();
                onSave?.();
              }}
              onDelete={() => {
                // The changes died with the object; leaving must not
                // trigger the navigation guard.
                form.reset();
                allowNextNavigation.current = true;
                onDelete?.();
              }}
              onClose={onClose}
            />
            <div className="flex flex-col items-center overflow-y-auto scrollbar">
              <div className="flex p-6 w-full gap-6 justify-center">
                <div className="flex-1">
                  <Main model={model} id={id} hiddenFields={hiddenFields} />
                </div>
                <div className="shrink-0 w-[320px] empty:hidden">
                  <Aside model={model} hiddenFields={hiddenFields} />
                </div>
              </div>
            </div>
          </div>
        </EditorReadOnlyContext>
      </ResourcePathContext>
    </Form>
  ) : (
    <div className="py-12 sm:py-24 md:py-48 flex items-center justify-center">
      <Spinner />
    </div>
  );
}
