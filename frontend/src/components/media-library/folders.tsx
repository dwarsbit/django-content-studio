import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiFolder } from "react-icons/pi";

import { CreateFolderButton } from "@/components/media-library/create-folder-button";
import { EditFolder } from "@/components/media-library/edit-folder";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Pagination } from "@/components/ui/pagination";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useDeleteFolder } from "@/hooks/use-delete-folder";
import { useDiscover } from "@/hooks/use-discover";
import { useFolderPath } from "@/hooks/use-folder-path";
import { useListFolder } from "@/hooks/use-list-folder";
import { cn } from "@/lib/utils";

export function Folders({
  parent,
  onSelect,
}: {
  parent: string | null;
  onSelect?(folder: string | null): void;
}) {
  const { data: discover } = useDiscover();
  const folderModelName = discover?.media_library.models.folder_model;
  const model = discover?.models.find(R.whereEq({ label: folderModelName }));
  const [page, setPage] = useState(1);
  const { isFetching, data } = useListFolder({ parent, page });
  const { data: folderPath } = useFolderPath(parent);

  return (
    <div
      className={cn("rounded-md border bg-background", {
        "animate-pulse": isFetching,
      })}
    >
      <ul className="p-2 space-y-1.5">
        {folderPath && !R.isEmpty(folderPath) && (
          <li className="flex">
            <button
              className="w-full text-left group font-medium px-4 py-0.5 flex items-center gap-2 hover:bg-accent rounded-md"
              onClick={() => {
                const parent = folderPath[folderPath.length - 2]?.id ?? null;
                setPage(1);
                onSelect?.(parent);
              }}
            >
              <span className="size-5 bg-accent p-px rounded flex items-center justify-center">
                {".."}
              </span>
            </button>
          </li>
        )}
        {data?.results.map((folder) => (
          <Folder
            key={folder.id}
            folder={folder}
            onSelect={() => {
              setPage(1);
              onSelect?.(folder.id);
            }}
          />
        ))}
      </ul>

      {data && (
        <div className="p-2 border-t empty:hidden">
          <Pagination
            pages={data.pagination.pages}
            current={page}
            onPageChange={setPage}
          />
        </div>
      )}

      {model?.admin?.permissions.add_permission && (
        <div className="font-medium text-sm border-t border-dashed px-6 py-2">
          <CreateFolderButton parent={parent} />
        </div>
      )}
    </div>
  );
}

function Folder({
  folder,
  onSelect,
}: {
  folder: { id: string; name: string };
  onSelect: VoidFunction;
}) {
  const { t } = useTranslation();
  const { mutate: deleteFolder } = useDeleteFolder();
  const [edit, setEdit] = useState(false);
  const confirm = useConfirmDialog();

  return (
    <li key={folder.id} className="flex">
      {edit ? (
        <EditFolder folder={folder} onClose={() => setEdit(false)} />
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              className="w-full text-left group font-medium text-sm px-4 py-0.5 flex items-center gap-2 hover:bg-foreground/10 rounded-md data-[state=open]:bg-accent"
              onClick={onSelect}
            >
              <span className="size-5 bg-blue-50 p-px rounded flex items-center justify-center text-blue-500">
                <PiFolder size={14} />
              </span>
              <span>{folder.name}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => setEdit(true)}>
              {t("common.rename")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive"
              onSelect={async () => {
                const confirmed = await confirm({
                  title: t("common.delete_confirm_title"),
                  description: t("common.delete_confirm_description"),
                });
                if (confirmed) {
                  deleteFolder(folder.id);
                }
              }}
            >
              {t("common.delete")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </li>
  );
}
