import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { BulkBar } from "@/components/ui/bulk-bar";
import { Button } from "@/components/ui/button";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useHttp } from "@/hooks/use-http";
import { cn, getErrorMessage } from "@/lib/utils";
import type { BulkAction } from "@/types";

/**
 * The bulk bar: shown while rows are selected in the table view, it
 * runs the model's bulk actions on the selection. Confirmations come
 * from the action itself (a server-side string), and the selection is
 * cleared after a successful action.
 */
export function ContentBulkBar({
  modelLabel,
  actions,
  ids,
  onDone,
}: {
  modelLabel: string;
  actions: BulkAction[];
  ids: string[];
  onDone(): void;
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();

  const { mutateAsync: run, isPending } = useMutation({
    async mutationFn(action: BulkAction) {
      const { data } = await http.post(`/content/${modelLabel}/bulk`, {
        action: action.id,
        ids,
      });

      return data as { count?: number; message?: string };
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["resources", modelLabel],
      });
    },
  });

  async function runAction(action: BulkAction) {
    if (action.confirm) {
      const confirmed = await confirm({ description: action.confirm });

      if (!confirmed) {
        return;
      }
    }

    try {
      const result = await run(action);

      toast.success(
        result?.message ??
          (result?.count != null
            ? t("bulk.count", { count: result.count })
            : t("bulk.done")),
      );

      onDone();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  return (
    <BulkBar
      label={t("bulk.selected", { count: ids.length })}
      clearLabel={t("bulk.clear")}
      onClear={onDone}
    >
      {actions.map((action) => (
        <Button
          key={action.id}
          size="sm"
          variant="ghost"
          disabled={isPending}
          className={cn({
            "text-destructive hover:bg-destructive/10 hover:text-destructive":
              action.destructive,
          })}
          onClick={() => runAction(action)}
        >
          {action.icon && <span className={cn(action.icon, "text-sm")} />}
          {action.label}
        </Button>
      ))}
    </BulkBar>
  );
}
