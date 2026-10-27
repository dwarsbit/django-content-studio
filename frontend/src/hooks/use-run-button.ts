import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useShowResult } from "@/hooks/use-show-result";
import { getErrorMessage } from "@/lib/utils";
import type { ButtonResult } from "@/types";

/**
 * Runs a server-side button: confirms first when the button asks to,
 * shows the result's message as a notification, and a value the result
 * carries once in a dialog (see useShowResult).
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
  const showResult = useShowResult();
  const [isPending, setIsPending] = useState(false);

  const trigger = useCallback(async () => {
    if (question && !(await confirm({ description: question }))) {
      return;
    }

    setIsPending(true);

    try {
      const result = await run();

      showResult(result, t("button.done"));
      await onDone?.();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setIsPending(false);
    }
  }, [question, confirm, run, onDone, showResult, t]);

  return { trigger, isPending };
}
