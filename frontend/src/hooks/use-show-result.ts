import { useCallback, useContext } from "react";
import { toast } from "sonner";

import { ValueDialogContext } from "@/lib/value-dialog-context";
import type { ButtonResult } from "@/types";

/**
 * Shows what the server reports back after a button or a create: the
 * message as a notification, and a value once in a dialog with a copy
 * button.
 */
export function useShowResult() {
  const { showValue } = useContext(ValueDialogContext);

  return useCallback(
    (result: ButtonResult, fallbackMessage?: string) => {
      const message = result.message ?? fallbackMessage;

      if (message) {
        toast.success(message);
      }

      if (result.value != null) {
        showValue(result.value);
      }
    },
    [showValue],
  );
}
