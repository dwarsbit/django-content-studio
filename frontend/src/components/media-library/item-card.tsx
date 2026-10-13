import bytes from "bytes";
import * as R from "ramda";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PiCheckBold,
  PiDownloadBold,
  PiFileBold,
  PiFolderBold,
  PiFoldersBold,
  PiHouseBold,
  PiLinkBold,
} from "react-icons/pi";
import { useCopyToClipboard } from "react-use";
import { toast } from "sonner";

import { ItemEdit } from "@/components/media-library/item-edit";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useDeleteMedia } from "@/hooks/use-delete-media";
import { useListFolder } from "@/hooks/use-list-folder";
import { useUpdateMedia } from "@/hooks/use-update-media";
import { cn, getErrorMessage } from "@/lib/utils";
import type { MediaItem } from "@/types";

export function ItemCard({
  item,
  className,
  children,
  onClick,
  selected = false,
  onToggleSelect,
  ...props
}: {
  item: MediaItem;
  /** Selection state, driven by the page's bulk selection. */
  selected?: boolean;
  onToggleSelect?(): void;
} & React.ComponentProps<"button">) {
  const { t } = useTranslation();
  const { mutateAsync: deleteMedia, isPending } = useDeleteMedia();
  const { mutateAsync: updateMedia } = useUpdateMedia();
  const confirm = useConfirmDialog();
  const [edit, setEdit] = useState(false);
  const [, copy] = useCopyToClipboard();

  return (
    <ContextMenu>
      <ItemEdit itemId={item.id} open={edit} onClose={() => setEdit(false)} />
      <ContextMenuTrigger asChild key={item.id}>
        <button
          {...props}
          onClick={(e) => {
            if (onClick) {
              onClick(e);
              return;
            }
            setEdit(true);
          }}
          className={cn(
            "group/card relative cursor-pointer border rounded-md bg-card p-2 data-[state=open]:border-ring flex flex-col",
            selected && "border-ring",
            {
              "animate-pulse pointer-events-none select-none": isPending,
            },
            className,
          )}
        >
          {onToggleSelect && (
            <span
              role="checkbox"
              aria-checked={selected}
              aria-label={t("common.select_item")}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
              className={cn(
                "absolute top-1 left-1 z-10 size-4 rounded-[4px] border bg-background cursor-pointer",
                "opacity-0 group-hover/card:opacity-100 data-[selected=true]:opacity-100",
                selected
                  ? "border-primary bg-primary text-primary-foreground flex items-center justify-center"
                  : "hover:border-ring",
              )}
              data-selected={selected}
            >
              {selected && <PiCheckBold className="size-3" />}
            </span>
          )}
          {children}
          {item.type === "image" ? (
            <img
              draggable={false}
              src={item.thumbnail}
              className="rounded aspect-square object-cover"
            />
          ) : (
            <div className="rounded aspect-square w-full bg-muted items-center justify-center flex">
              <PiFileBold className="size-5 text-muted-foreground" />
            </div>
          )}
          <div className="pt-2 font-medium mb-2 line-clamp-1 break-all text-left">
            {item.name}
          </div>
          <div className="flex justify-between items-center">
            <div
              className={cn(
                "text-xs font-semibold px-2 py-0.5 border rounded select-none",
                {
                  "bg-blue-50 text-blue-500 border-blue-200":
                    item.type === "image",
                  "bg-amber-50 text-amber-500 border-amber-200":
                    item.type === "file",
                  "bg-pink-50 text-pink-500 border-pink-200":
                    item.type === "video",
                  "bg-emerald-50 text-emerald-500 border-emerald-200":
                    item.type === "audio",
                },
              )}
            >
              {t(`media_library.file_types.${item.type}`)}
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              {!R.isNil(item.size) && bytes(item.size * 1000)}
            </div>
          </div>
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onSelect={() => setEdit(true)}>
          {t("common.edit")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            copy(item.file);
            toast.success(t("common.copied_to_clipboard"));
          }}
        >
          <PiLinkBold className="size-3.5" />
          {t("media_library.copy_url")}
        </ContextMenuItem>
        <ContextMenuItem asChild>
          <a href={item.file} download>
            <PiDownloadBold className="size-3.5" />
            {t("common.download")}
          </a>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t("common.move")}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <FolderMenu
              parent={null}
              onSelect={(folder) => updateMedia({ ...item, folder })}
            />
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive"
          onSelect={async () => {
            const confirmed = await confirm({
              title: t("common.delete_confirm_title"),
              description: t("common.delete_confirm_description"),
            });

            if (!confirmed) {
              return;
            }

            const id = toast.loading(t("common.deleting"));

            try {
              await deleteMedia(item.id);
              toast.success(t("common.deleted"), { id });
            } catch (e: unknown) {
              toast.error(getErrorMessage(e), { id });
            }
          }}
        >
          {t("common.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FolderMenu({
  parent,
  onSelect,
}: {
  parent: string | null;
  onSelect(id: string | null): void;
}) {
  const { t } = useTranslation();
  const { data: folders } = useListFolder({ parent, limit: 1000 });

  return (
    <>
      {!parent && (
        <>
          <ContextMenuItem onSelect={() => onSelect(null)}>
            <PiHouseBold className="size-3.5" />
            {t("media_library.root_folder")}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {folders?.results.map((folder) =>
        folder.has_children ? (
          <ContextMenuSub key={folder.id}>
            <ContextMenuSubTrigger>
              <PiFoldersBold className="mr-2 size-3.5" />
              {folder.name}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={() => onSelect(folder.id)}>
                {t("media_library.move_here")}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <FolderMenu parent={folder.id} onSelect={onSelect} />
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : (
          <ContextMenuItem key={folder.id} onSelect={() => onSelect(folder.id)}>
            <PiFolderBold className="size-3.5" />
            {folder.name}
          </ContextMenuItem>
        ),
      )}
    </>
  );
}
