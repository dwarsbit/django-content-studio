import { useTranslation } from "react-i18next";
import { FiCopy } from "react-icons/fi";
import { useCopyToClipboard } from "react-use";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shows a value a button returned, such as a newly generated secret,
 * with a copy button. The server returns it once: closing the dialog
 * is the last chance to copy it.
 */
export function ButtonValueDialog({
  value,
  onClose,
}: {
  value: string | null;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const [, copy] = useCopyToClipboard();

  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("button.value_title")}</DialogTitle>
          <DialogDescription>{t("button.value_description")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 break-all rounded-md bg-muted px-3 py-2 text-sm">
            {value}
          </code>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("button.copy")}
            onClick={() => {
              copy(value ?? "");
              toast.success(t("app.copied_to_clipboard"));
            }}
          >
            <FiCopy />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("button.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
