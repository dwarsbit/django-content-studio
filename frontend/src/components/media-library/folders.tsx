import * as R from "ramda";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PiCaretDownBold,
  PiCaretRightBold,
  PiFolderSimpleBold,
  PiImagesBold,
} from "react-icons/pi";

import { CreateFolderButton } from "@/components/media-library/create-folder-button";
import { EditFolder } from "@/components/media-library/edit-folder";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useDeleteFolder } from "@/hooks/use-delete-folder";
import { useDiscover } from "@/hooks/use-discover";
import { useFolderPath } from "@/hooks/use-folder-path";
import { useListFolder } from "@/hooks/use-list-folder";
import { cn } from "@/lib/utils";
import type { MediaFolder } from "@/types";

/**
 * The folder tree: the library's root, then the folders with their
 * counts, nested folders behind carets (the path to the current folder
 * starts expanded), and "New folder" at the foot. Right-click renames
 * or deletes a folder.
 */
export function Folders({
  current,
  onSelect,
  className,
}: {
  current: string | null;
  onSelect(folder: string | null): void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const folderModelName = discover?.media_library.models.folder_model;
  const model = discover?.models.find(R.whereEq({ label: folderModelName }));
  const { isFetching, data } = useListFolder({ parent: null, limit: 1000 });
  const { data: folderPath } = useFolderPath(current);
  const path = (folderPath ?? []).map((folder) => String(folder.id));

  return (
    <nav
      aria-label={t("media_library.folders")}
      className={cn("space-y-0.5", { "animate-pulse": isFetching }, className)}
    >
      <FolderRow
        icon={<PiImagesBold />}
        label={t("media_library.title")}
        active={current === null}
        onClick={() => onSelect(null)}
      />
      {data?.results.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          depth={0}
          current={current}
          path={path}
          onSelect={onSelect}
        />
      ))}
      {model?.admin?.permissions.add_permission && (
        <div className="pt-2">
          <CreateFolderButton
            parent={current}
            className="w-full justify-start text-muted-foreground"
          />
        </div>
      )}
    </nav>
  );
}

function FolderRow({
  icon,
  label,
  count,
  active,
  depth = 0,
  caret,
  onClick,
  ...props
}: {
  icon: ReactNode;
  label: string;
  count?: number | null;
  active?: boolean;
  depth?: number;
  /** The expand/collapse button of a folder with children. */
  caret?: ReactNode;
  onClick(): void;
} & Omit<React.ComponentProps<"div">, "onClick">) {
  return (
    <div
      {...props}
      className={cn(
        "flex items-center h-8 rounded-md pr-2 text-sm font-medium select-none",
        active
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted",
      )}
      style={{ paddingLeft: 4 + depth * 16 }}
    >
      <span className="size-5 shrink-0 flex items-center justify-center">
        {caret}
      </span>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        className="flex-1 min-w-0 h-full flex items-center gap-2 rounded-md text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onClick}
      >
        <span
          className={cn(
            "shrink-0 [&_svg]:size-4",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <span className="flex-1 truncate">{label}</span>
        {count != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </button>
    </div>
  );
}

function FolderNode({
  folder,
  depth,
  current,
  path,
  onSelect,
}: {
  folder: MediaFolder;
  depth: number;
  current: string | null;
  /** The ids of the current folder and its ancestors. */
  path: string[];
  onSelect(folder: string | null): void;
}) {
  const { t } = useTranslation();
  const { mutate: deleteFolder } = useDeleteFolder();
  const confirm = useConfirmDialog();
  const [edit, setEdit] = useState(false);

  // A folder on the path to the current one opens; navigating into
  // its subtree later opens it again (adjusted during render).
  const inPath = path.includes(String(folder.id));
  const [expanded, setExpanded] = useState(inPath);
  const [lastInPath, setLastInPath] = useState(inPath);

  if (inPath !== lastInPath) {
    setLastInPath(inPath);
    if (inPath) {
      setExpanded(true);
    }
  }

  const { data: children } = useListFolder({
    parent: folder.id,
    limit: 1000,
    enabled: expanded && folder.has_children,
  });

  return (
    <>
      {edit ? (
        <div style={{ paddingLeft: 4 + depth * 16 }}>
          <EditFolder folder={folder} onClose={() => setEdit(false)} />
        </div>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <FolderRow
              icon={<PiFolderSimpleBold />}
              label={folder.name}
              count={folder.count}
              depth={depth}
              active={current === String(folder.id)}
              caret={
                folder.has_children && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={
                      expanded
                        ? t("media_library.collapse_folder", {
                            name: folder.name,
                          })
                        : t("media_library.expand_folder", {
                            name: folder.name,
                          })
                    }
                    className="size-5 rounded-sm flex items-center justify-center text-muted-foreground hover:bg-foreground/10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? <PiCaretDownBold /> : <PiCaretRightBold />}
                  </button>
                )
              }
              onClick={() => onSelect(folder.id)}
            />
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
      {expanded &&
        children?.results.map((child) => (
          <FolderNode
            key={child.id}
            folder={child}
            depth={depth + 1}
            current={current}
            path={path}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}
