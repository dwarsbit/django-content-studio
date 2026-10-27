import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { getErrorMessage } from "@/lib/utils";
import type { ButtonResult } from "@/types";

/**
 * Runs a server-side button: confirms first when the button asks to,
 * shows the result's message as a notification, and keeps a value the
 * result carries until the editor closes the dialog that shows it.
 * Shared by the edit page's Button component and the main menu's
 * buttons.
 */
export function useRunButton({
  confirm: question,
  run,
  onDone,
}: {
  confirm?: string | null;
  run(): Promise<ButtonResult>;
  onDone?(): unknown;
}) {
  const { t } = useTranslation();
  const confirm = useConfirmDialog();
  const [isPending, setIsPending] = useState(false);
  const [value, setValue] = useState<string | null>(null);

  const trigger = useCallback(async () => {
    if (question && !(await confirm({ description: question }))) {
      return;
    }

    setIsPending(true);

    try {
      const result = await run();

      toast.success(result.message ?? t("button.done"));
      setValue(result.value ?? null);
      await onDone?.();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setIsPending(false);
    }
  }, [question, confirm, run, onDone, t]);

  return { trigger, isPending, value, clearValue: () => setValue(null) };
}
