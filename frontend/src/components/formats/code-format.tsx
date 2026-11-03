import { useTranslation } from "react-i18next";
import { PiCopyBold } from "react-icons/pi";
import { useCopyToClipboard } from "react-use";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * An identifier such as a UUID, SKU or key: monospace, with a button
 * that copies it.
 */
export function CodeFormat({
  value,
  emptyValue,
}: {
  value: unknown;
  emptyValue?: string | null;
}) {
  const { t } = useTranslation();
  const [, copy] = useCopyToClipboard();

  if (value === null || value === undefined || value === "") {
    return <span>{emptyValue ?? ""}</span>;
  }
  const text = String(value);

  return (
    <span className="group/code inline-flex max-w-xs items-center gap-1">
      <code className="truncate font-mono text-xs" title={text}>
        {text}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("formats.copy")}
        title={t("formats.copy")}
        className="opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100"
        onClick={(event) => {
          // A click on the button copies; it does not open the row.
          event.stopPropagation();
          copy(text);
          toast.success(t("common.copied_to_clipboard"));
        }}
      >
        <PiCopyBold />
      </Button>
    </span>
  );
}
