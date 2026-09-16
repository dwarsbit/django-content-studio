import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as R from "ramda";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { Aside } from "@/components/content-editor/aside";
import { Main } from "@/components/content-editor/main";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import type { Resource } from "@/types";

export function TenantSetupPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const http = useHttp();
  const { data: discover } = useDiscover();
  const tenantModel = discover?.models.find(
    R.whereEq({ label: discover?.multitenancy.tenant_model }),
  );

  const defaultValues = Object.entries(tenantModel?.fields ?? {}).reduce(
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
    defaultValues: defaultValues,
  });

  const { mutateAsync: save, isPending } = useMutation({
    async mutationFn(values: Partial<Resource>) {
      await http[values.id ? "put" : "post"](
        `/content/${tenantModel?.label}${values.id ? `/${values.id}` : ""}`,
        values,
      );
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["resources", tenantModel?.label],
      });
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await save(values);
      window.location.reload();
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

  return (
    tenantModel && (
      <div className="flex flex-col items-center justify-center min-h-screen">
        {tenantModel.admin ? (
          <div className="w-full max-w-lg">
            <h1 className="text-2xl font-semibold mb-8 text-center">
              {t("tenant.setup.title", { tenant: tenantModel.verbose_name })}
            </h1>
            <div className="w-full">
              <Form {...form}>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <Main model={tenantModel} hiddenFields={[]} />
                  </div>
                  <Aside model={tenantModel} hiddenFields={[]} />
                </div>
              </Form>
              <div className="mt-4">
                <Button
                  className="w-full"
                  onClick={form.handleSubmit(onSubmit)}
                  isLoading={isPending}
                >
                  {t("common.create")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-prose text-center text-amber-500 bg-amber-50 p-3 rounded-md font-medium leading-snug">
            {t("tenant.setup.model_not_found", {
              tenant: tenantModel.verbose_name,
            })}
          </div>
        )}
      </div>
    )
  );
}
