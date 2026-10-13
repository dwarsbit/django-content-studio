import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FolderPicker } from "@/components/media-library/folder-picker";
import { Button } from "@/components/ui/button";
import { useBulkMedia } from "@/hooks/use-bulk-media";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { getErrorMessage } from "@/lib/utils";

/**
 * The media library's bulk bar: shown while items are selected, it
 * runs the built-in bulk actions on the selection — delete (with
 * confirmation, destructive) and move to folder — and clears when
 * done.
 */
export function MediaBulkBar({
  ids,
  onDone,
}: {
  ids: string[];
  onDone(): void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirmDialog();
  const { mutateAsync: run, isPending } = useBulkMedia();

  async function deleteSelection() {
    const confirmed = await confirm({
      title: t("common.delete_confirm_title"),
      description: t("common.delete_confirm_description"),
    });

    if (!confirmed) {
      return;
    }

    try {
      const result = await run({ action: "delete", ids });
      toast.success(t("bulk.count", { count: result.count }));
      onDone();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  async function moveSelection(folder: string | null) {
    try {
      const result = await run({ action: "move", ids, folder });
      toast.success(t("bulk.count", { count: result.count }));
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
      <Button
        size="sm"
        variant="destructive"
        disabled={isPending}
        onClick={deleteSelection}
      >
        {t("common.delete")}
      </Button>
      <FolderPicker
        label={t("common.move")}
        onSelect={(folder) => moveSelection(folder)}
      />
      <Button size="sm" variant="link" onClick={onDone}>
        {t("bulk.clear")}
      </Button>
    </div>
  );
}
