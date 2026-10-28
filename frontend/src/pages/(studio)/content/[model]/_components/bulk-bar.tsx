import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ExportMenu } from "@/components/export-menu";
import { BulkBar } from "@/components/ui/bulk-bar";
import { Button } from "@/components/ui/button";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useExport } from "@/hooks/use-export";
import { useHttp } from "@/hooks/use-http";
import { getDownloadErrorMessage } from "@/lib/download";
import { cn, getErrorMessage } from "@/lib/utils";
import type { BulkAction, ExportFormat } from "@/types";

/**
 * The bulk bar: shown while rows are selected in the table view, it
 * runs the model's bulk actions on the selection. Confirmations come
 * from the action itself (a server-side string), and the selection is
 * cleared after a successful action. The built-in export downloads the
 * selection, in the list's ordering, and keeps it selected.
 */
export function ContentBulkBar({
  modelLabel,
  actions,
  ids,
  ordering,
  onDone,
}: {
  modelLabel: string;
  actions: BulkAction[];
  ids: string[];
  ordering?: string | null;
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

  const { mutateAsync: runExport, isPending: isExporting } =
    useExport(modelLabel);

  async function exportSelection(format: ExportFormat) {
    try {
      await runExport({ format, ids, ordering });
    } catch (e) {
      toast.error(await getDownloadErrorMessage(e));
    }
  }

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
      {actions.map((action) =>
        action.formats ? (
          <ExportMenu
            key={action.id}
            formats={action.formats}
            icon={action.icon}
            variant="ghost"
            disabled={isPending || isExporting}
            onExport={exportSelection}
          />
        ) : (
          <Button
            key={action.id}
            size="sm"
            variant="ghost"
            disabled={isPending || isExporting}
            className={cn({
              "text-destructive hover:bg-destructive/10 hover:text-destructive":
                action.destructive,
            })}
            onClick={() => runAction(action)}
          >
            {action.icon && <span className={cn(action.icon, "text-sm")} />}
            {action.label}
          </Button>
        ),
      )}
    </BulkBar>
  );
}
