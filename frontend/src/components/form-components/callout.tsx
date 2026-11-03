import type { IconType } from "react-icons";
import {
  PiCheckCircleBold,
  PiInfoBold,
  PiWarningBold,
  PiWarningOctagonBold,
} from "react-icons/pi";

import { MarkdownText } from "@/components/markdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useComponentText } from "@/hooks/use-component-text";
import { cn } from "@/lib/utils";
import type { CalloutVariant, FormField, Model } from "@/types";

const VARIANTS: Record<
  CalloutVariant,
  {
    alert: "default" | "success" | "warning" | "destructive";
    Icon: IconType;
  }
> = {
  info: { alert: "default", Icon: PiInfoBold },
  success: { alert: "success", Icon: PiCheckCircleBold },
  warning: { alert: "warning", Icon: PiWarningBold },
  danger: { alert: "destructive", Icon: PiWarningOctagonBold },
};

/**
 * A Callout component: highlighted Markdown text with an optional
 * title. The variant sets the color and the default icon; an icon class
 * from the backend replaces the icon.
 */
export function Callout({
  model,
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const text = useComponentText(model, formField);
  const { alert, Icon } =
    VARIANTS[formField.variant ?? "info"] ?? VARIANTS.info;

  if (!text && !formField.title) {
    return null;
  }

  return (
    <Alert
      variant={alert}
      role="note"
      data-testid="callout"
      className="grid-cols-[calc(var(--spacing)*4)_1fr] gap-x-3"
    >
      {formField.icon ? (
        <span
          aria-hidden
          className={cn(formField.icon, "text-[16px] translate-y-0.5")}
        />
      ) : (
        <Icon aria-hidden />
      )}
      {formField.title && <AlertTitle>{formField.title}</AlertTitle>}
      {text && (
        <AlertDescription className="whitespace-normal">
          <MarkdownText>{text}</MarkdownText>
        </AlertDescription>
      )}
    </Alert>
  );
}
