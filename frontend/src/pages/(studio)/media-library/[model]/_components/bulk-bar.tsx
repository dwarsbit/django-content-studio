import { useTranslation } from "react-i18next";
import { PiFolderBold, PiTrashBold } from "react-icons/pi";
import { toast } from "sonner";

import { FolderPicker } from "@/components/media-library/folder-picker";
import { BulkBar } from "@/components/ui/bulk-bar";
import { Button } from "@/components/ui/button";
import { useBulkMedia } from "@/hooks/use-bulk-media";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { getErrorMessage } from "@/lib/utils";

/**
 * The media library's bulk bar, floating at the foot of the page while
 * files are selected: move to a folder (with folders) and delete (with
 * confirmation); the selection clears when done.
 */
export function MediaBulkBar({
  ids,
  folders,
  onDone,
}: {
  ids: string[];
  folders: boolean;
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
    <BulkBar
      label={t("bulk.selected", { count: ids.length })}
      clearLabel={t("bulk.clear")}
      onClear={onDone}
    >
      {folders && (
        <FolderPicker
          trigger={
            <Button size="sm" variant="ghost" disabled={isPending}>
              <PiFolderBold />
              {t("common.move")}
            </Button>
          }
          onSelect={(folder) => moveSelection(folder)}
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={deleteSelection}
      >
        <PiTrashBold />
        {t("common.delete")}
      </Button>
    </BulkBar>
  );
}
