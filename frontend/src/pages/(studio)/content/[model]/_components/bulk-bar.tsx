import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
export function BulkBar({
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
    <div className="flex items-center gap-2 flex-wrap">
      <span className="select-none text-muted-foreground">
        {t("bulk.selected", { count: ids.length })}
      </span>
      {actions.map((action) => (
        <Button
          key={action.id}
          size="sm"
          variant={action.destructive ? "destructive" : "outline"}
          disabled={isPending}
          onClick={() => runAction(action)}
        >
          {action.icon && <span className={cn(action.icon, "text-sm")} />}
          {action.label}
        </Button>
      ))}
      <Button size="sm" variant="link" onClick={onDone}>
        {t("bulk.clear")}
      </Button>
    </div>
  );
}
