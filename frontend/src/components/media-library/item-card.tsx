import React from "react";
import { useTranslation } from "react-i18next";
import {
  PiDotsThreeBold,
  PiDownloadSimpleBold,
  PiFolderBold,
  PiFoldersBold,
  PiHouseBold,
  PiLinkBold,
  PiPencilSimpleBold,
  PiTrashBold,
} from "react-icons/pi";
import { useCopyToClipboard } from "react-use";
import { toast } from "sonner";

import {
  describeFile,
  extensionOf,
  FileIcon,
} from "@/components/media-library/file-meta";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useDeleteMedia } from "@/hooks/use-delete-media";
import { useDiscover } from "@/hooks/use-discover";
import { useListFolder } from "@/hooks/use-list-folder";
import { useUpdateMedia } from "@/hooks/use-update-media";
import { cn, getErrorMessage } from "@/lib/utils";
import type { MediaItem } from "@/types";

/**
 * The parts a file's actions are built from, so the same menu renders
 * as a context menu (right-click) and as a dropdown (the more button).
 */
type MenuParts = {
  Item: React.ComponentType<{
    children?: React.ReactNode;
    className?: string;
    asChild?: boolean;
    onSelect?(event: Event): void;
  }>;
  Separator: React.ComponentType<{ className?: string }>;
  Sub: React.ComponentType<{ children?: React.ReactNode }>;
  SubTrigger: React.ComponentType<{
    children?: React.ReactNode;
    className?: string;
  }>;
  SubContent: React.ComponentType<{ children?: React.ReactNode }>;
};

const CONTEXT_MENU: MenuParts = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

const DROPDOWN_MENU: MenuParts = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};

/** Deletes a file after confirmation, with the loading and done toasts. */
export function useDeleteItem() {
  const { t } = useTranslation();
  const { mutateAsync: deleteMedia, isPending } = useDeleteMedia();
  const confirm = useConfirmDialog();

  const remove = async (item: MediaItem): Promise<boolean> => {
    const confirmed = await confirm({
      title: t("common.delete_confirm_title"),
      description: t("common.delete_confirm_description"),
    });

    if (!confirmed) {
      return false;
    }

    const id = toast.loading(t("common.deleting"));

    try {
      await deleteMedia(item.id);
      toast.success(t("common.deleted"), { id });
      return true;
    } catch (e: unknown) {
      toast.error(getErrorMessage(e), { id });
      return false;
    }
  };

  return { remove, isPending };
}

/** The actions of one file: edit, copy URL, download, move, delete. */
function ItemMenuItems({
  item,
  menu: M,
  onOpen,
  onDelete,
}: {
  item: MediaItem;
  menu: MenuParts;
  onOpen?(): void;
  onDelete(): void;
}) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { mutateAsync: updateMedia } = useUpdateMedia();
  const [, copy] = useCopyToClipboard();
  const hasFolders = discover?.media_library.folders ?? false;

  return (
    <>
      {onOpen && (
        <M.Item onSelect={onOpen}>
          <PiPencilSimpleBold className="size-3.5" />
          {t("common.edit")}
        </M.Item>
      )}
      <M.Item
        onSelect={() => {
          copy(item.file);
          toast.success(t("common.copied_to_clipboard"));
        }}
      >
        <PiLinkBold className="size-3.5" />
        {t("media_library.copy_url")}
      </M.Item>
      <M.Item asChild>
        <a href={item.file} download>
          <PiDownloadSimpleBold className="size-3.5" />
          {t("common.download")}
        </a>
      </M.Item>
      {hasFolders && (
        <M.Sub>
          <M.SubTrigger>
            <PiFolderBold className="size-3.5" />
            {t("common.move")}
          </M.SubTrigger>
          <M.SubContent>
            <FolderMenu
              menu={M}
              parent={null}
              onSelect={(folder) => updateMedia({ ...item, folder })}
            />
          </M.SubContent>
        </M.Sub>
      )}
      <M.Separator />
      <M.Item className="text-destructive" onSelect={onDelete}>
        <PiTrashBold className="size-3.5" />
        {t("common.delete")}
      </M.Item>
    </>
  );
}

function FolderMenu({
  menu: M,
  parent,
  onSelect,
}: {
  menu: MenuParts;
  parent: string | null;
  onSelect(id: string | null): void;
}) {
  const { t } = useTranslation();
  const { data: folders } = useListFolder({ parent, limit: 1000 });

  return (
    <>
      {!parent && (
        <>
          <M.Item onSelect={() => onSelect(null)}>
            <PiHouseBold className="size-3.5" />
            {t("media_library.root_folder")}
          </M.Item>
          <M.Separator />
        </>
      )}
      {folders?.results.map((folder) =>
        folder.has_children ? (
          <M.Sub key={folder.id}>
            <M.SubTrigger>
              <PiFoldersBold className="size-3.5" />
              {folder.name}
            </M.SubTrigger>
            <M.SubContent>
              <M.Item onSelect={() => onSelect(folder.id)}>
                {t("media_library.move_here")}
              </M.Item>
              <M.Separator />
              <FolderMenu menu={M} parent={folder.id} onSelect={onSelect} />
            </M.SubContent>
          </M.Sub>
        ) : (
          <M.Item key={folder.id} onSelect={() => onSelect(folder.id)}>
            <PiFolderBold className="size-3.5" />
            {folder.name}
          </M.Item>
        ),
      )}
    </>
  );
}

/**
 * The more button of a file: a dropdown with the file's actions. The
 * grid card and the list row show it on hover.
 */
export function ItemActions({
  item,
  onOpen,
  variant = "outline",
  className,
}: {
  item: MediaItem;
  onOpen?(): void;
  variant?: "outline" | "ghost";
  className?: string;
}) {
  const { t } = useTranslation();
  const { remove } = useDeleteItem();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="icon-xs"
          aria-label={t("media_library.file_actions")}
          className={cn("data-[state=open]:opacity-100", className)}
        >
          <PiDotsThreeBold />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ItemMenuItems
          item={item}
          menu={DROPDOWN_MENU}
          onOpen={onOpen}
          onDelete={() => remove(item)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A file in the grid: the thumbnail (or the type icon and extension)
 * on a mist tile, the name and a meta line. Clicking the card opens
 * the file (`onOpen`) unless `onClick` takes over, as the media picker
 * does to select; with `onToggle` a checkbox selects the card for the
 * bulk actions. Right-click opens the file's actions; the more button
 * on hover offers the same.
 */
export function ItemCard({
  item,
  selected,
  onToggle,
  onOpen,
  onClick,
  className,
  children,
}: {
  item: MediaItem;
  selected?: boolean;
  onToggle?(): void;
  onOpen?(): void;
  onClick?(): void;
  className?: string;
  /** Overlays, positioned against the card. */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { remove, isPending } = useDeleteItem();
  const extension = extensionOf(item);
  const typeLabel = t(`media_library.file_types.${item.type}`);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-slot="media-card"
          className={cn(
            "group relative rounded-lg border bg-card overflow-hidden transition-[box-shadow,border-color]",
            "hover:shadow-md data-[state=open]:border-ring",
            {
              "border-ring ring-3 ring-ring/30": selected,
              "animate-pulse pointer-events-none select-none": isPending,
            },
            className,
          )}
        >
          <button
            type="button"
            onClick={onClick ?? onOpen}
            className="block w-full text-left cursor-pointer outline-none rounded-lg focus-visible:ring-3 focus-visible:ring-ring"
          >
            <div className="aspect-[4/3] bg-muted border-b">
              {item.type === "image" && item.thumbnail ? (
                <img
                  draggable={false}
                  src={item.thumbnail}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <div className="size-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                  <FileIcon item={item} className="size-7" />
                  <span className="text-[11px] font-semibold tracking-wide">
                    {extension || typeLabel}
                  </span>
                </div>
              )}
            </div>
            <div className="px-3 py-2">
              <div className="font-medium truncate">{item.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {describeFile(item, typeLabel)}
              </div>
            </div>
          </button>

          {onToggle && (
            <span
              className={cn(
                "absolute top-2 left-2 flex transition-opacity",
                selected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
              )}
            >
              <Checkbox
                checked={!!selected}
                aria-label={t("common.select_item")}
                className="bg-background shadow-sm"
                onCheckedChange={onToggle}
              />
            </span>
          )}

          {onOpen && (
            <span className="absolute top-2 right-2 flex">
              <ItemActions
                item={item}
                onOpen={onOpen}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              />
            </span>
          )}

          {children}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ItemMenuItems
          item={item}
          menu={CONTEXT_MENU}
          onOpen={onOpen}
          onDelete={() => remove(item)}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
