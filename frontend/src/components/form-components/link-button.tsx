import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiCopy } from "react-icons/fi";
import { useCopyToClipboard } from "react-use";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import type { FormField, Model } from "@/types";

export function LinkButton({
  model,
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const form = useFormContext();
  const id = form.watch("id");
  const [_, copy] = useCopyToClipboard();

  const getLink = useCallback(async () => {
    const { data } = await http.get<{ url: string }>(
      `/content/${model.label}${model.admin.is_singleton ? "" : `/${id}`}/components/${formField.component_id}`,
    );

    return data.url;
  }, [http, model.label, model.admin.is_singleton, id, formField.component_id]);

  return (
    id && (
      <ButtonGroup>
        <Button
          variant="outline"
          onClick={async () => {
            const link = await getLink();

            window.open(link, "_blank", "noopener");
          }}
        >
          {formField.icon && (
            <span className={cn(formField.icon, "text-[14px]")} />
          )}
          {formField.label}
        </Button>
        {formField.copy && (
          <Button
            variant="outline"
            onClick={async () => {
              const link = await getLink();

              copy(link);

              toast.success(t("app.copied_to_clipboard"));
            }}
          >
            <FiCopy />
          </Button>
        )}
      </ButtonGroup>
    )
  );
}
