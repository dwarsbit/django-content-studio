import { useTranslation } from "react-i18next";
import { FiCopy } from "react-icons/fi";
import { useCopyToClipboard } from "react-use";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { useComponentLink } from "@/hooks/use-component-link";
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
  const [, copy] = useCopyToClipboard();
  const getLink = useComponentLink(model, formField);

  return (
    getLink && (
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
