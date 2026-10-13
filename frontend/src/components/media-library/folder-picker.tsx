import { useTranslation } from "react-i18next";
import { PiFolderBold, PiFoldersBold, PiHouseBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
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
import { useListFolder } from "@/hooks/use-list-folder";
import type { MediaFolder } from "@/types";

function FolderTree({
  parent,
  onSelect,
  t,
}: {
  parent: string | null;
  onSelect(id: string | null): void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const { data: folders } = useListFolder({ parent, limit: 1000 });

  return (
    <>
      {!parent && (
        <>
          <DropdownMenuItem onSelect={() => onSelect(null)}>
            <PiHouseBold className="size-3.5" />
            {t("media_library.root_folder")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      {folders?.results.map((folder: MediaFolder) =>
        folder.has_children ? (
          <DropdownMenuSub key={folder.id}>
            <DropdownMenuSubTrigger>
              <PiFoldersBold className="mr-2 size-3.5" />
              {folder.name}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => onSelect(folder.id)}>
                {t("media_library.move_here")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <FolderTree parent={folder.id} onSelect={onSelect} t={t} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem
            key={folder.id}
            onSelect={() => onSelect(folder.id)}
          >
            <PiFolderBold className="size-3.5" />
            {folder.name}
          </DropdownMenuItem>
        ),
      )}
    </>
  );
}

/**
 * A folder tree picker for dropdown menus: the root plus the folder
 * tree, recursive where folders have children.
 */
export function FolderPicker({
  label,
  onSelect,
}: {
  label: string;
  onSelect(id: string | null): void;
}) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <FolderTree parent={null} onSelect={onSelect} t={t} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
