import * as R from "ramda";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import {
  PiImageBold,
  PiRowsBold,
  PiSquaresFourBold,
  PiTableBold,
} from "react-icons/pi";
import { useSearchParams } from "react-router";

import { FolderPath } from "@/components/media-library/folder-path";
import { Folders } from "@/components/media-library/folders";
import { ItemEdit } from "@/components/media-library/item-edit";
import { UploadButton } from "@/components/media-library/upload-button";
import { TenantInfo } from "@/components/tenant-info";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { useDiscover } from "@/hooks/use-discover";
import { useListMedia } from "@/hooks/use-list-media";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { cn } from "@/lib/utils";

import { MediaBulkBar } from "./_components/bulk-bar";
import { Filters } from "./_components/filters";
import { GridView } from "./_components/grid-view";
import { ListView } from "./_components/list-view";
import { TableView } from "./_components/table-view";
import { UploadsPanel } from "./_components/uploads-panel";

const VIEWS = ["grid", "list", "table"] as const;

export function MediaLibraryPage() {
  return <MediaLibrary />;
}

function MediaLibrary() {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const model = discover?.media_library.models.media_model;
  const hasFolders = discover?.media_library.folders ?? false;

  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const folder = searchParams.get("folder");
  const search = searchParams.get("search") ?? "";
  const searchInFolder = searchParams.get("searchInFolder") === "true";
  const type = searchParams.get("type") ?? undefined;
  const tags = searchParams.get("tags") ?? undefined;
  const ordering = searchParams.get("ordering") ?? undefined;
  const viewParam = searchParams.get("view") ?? undefined;
  const view = R.includes(viewParam, VIEWS) ? viewParam : "grid";

  const { uploads, start } = useMediaUpload(folder);
  const { data } = useListMedia({
    folder,
    page,
    search,
    searchInFolder,
    type,
    tags,
    ordering,
  });

  // Selection is current-page: any URL change (page, folder, filter,
  // view) resets it — during render, the sanctioned way to adjust
  // state to an external change.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [lastParams, setLastParams] = useState(searchParams);
  // The item opened for editing from the list or table view (the
  // grid's cards manage their own edit dialog).
  const [editing, setEditing] = useState<string | null>(null);

  if (searchParams !== lastParams) {
    setLastParams(searchParams);
    setSelected(new Set());
  }

  const setParam = (key: string, value: string | null) => () =>
    setSearchParams((searchParams) => {
      if (value) {
        searchParams.set(key, value);
      } else {
        searchParams.delete(key);
      }
      return searchParams;
    });

  const toggleSelect = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleAll = (ids: string[]) =>
    setSelected((previous) =>
      ids.every((id) => previous.has(id))
        ? new Set()
        : new Set([...previous, ...ids]),
    );

  const { getRootProps, isDragActive } = useDropzone({ onDrop: start });

  const items = data?.results ?? [];
  const selectedIds = items
    .map((item) => String(item.id))
    .filter((id) => selected.has(id));

  return model ? (
    <div className="flex flex-col overflow-hidden">
      <TenantInfo label={model} />
      <UploadsPanel uploads={uploads} />
      <ItemEdit
        itemId={editing ?? ""}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />

      <div className="flex items-center gap-4 mb-6 py-3 px-5 border-b">
        <PiImageBold size={20} className="shrink-0" />
        <div className="flex-1">
          <h1 className="text-xl/tight font-semibold mb-0.5">
            {t("media_library.title")}
          </h1>
        </div>
        {data && (
          <div className="text-muted-foreground text-sm whitespace-nowrap">
            {t("media_library.items_count", { count: data.pagination.count })}
          </div>
        )}
        <UploadButton folder={folder} multiple onFiles={start} />
      </div>

      <div className="mb-4 px-5 flex items-start justify-between gap-4">
        <Filters folders={hasFolders} />
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {(
            [
              ["grid", <PiSquaresFourBold key="grid" />, "grid_view"],
              ["list", <PiRowsBold key="list" />, "list_view"],
              ["table", <PiTableBold key="table" />, "table_view"],
            ] as const
          ).map(([name, icon, label]) => (
            <button
              key={name}
              type="button"
              title={t(`media_library.${label}`)}
              onClick={setParam("view", name)}
              className={cn(
                "flex items-center justify-center size-6 rounded-md cursor-pointer",
                view === name
                  ? "bg-foreground/10"
                  : "hover:bg-foreground/5 text-muted-foreground",
              )}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-6 px-5">
        {hasFolders && !(search && !searchInFolder) && (
          <div className="w-[320px] shrink-0">
            <div className="mb-3">
              <FolderPath
                folder={folder}
                onSelect={(folder) =>
                  setSearchParams((searchParams) => {
                    if (folder) {
                      searchParams.set("folder", folder);
                    } else {
                      searchParams.delete("folder");
                    }
                    return searchParams;
                  })
                }
              />
            </div>
            <Folders
              parent={folder}
              onSelect={(folder) =>
                setSearchParams((searchParams) => {
                  if (folder) {
                    searchParams.set("folder", folder);
                  } else {
                    searchParams.delete("folder");
                  }
                  return searchParams;
                })
              }
            />
          </div>
        )}

        <div {...getRootProps()} className="overflow-y-auto scrollbar flex-1">
          {isDragActive && (
            <div className="mb-4 border-2 border-dashed rounded-lg py-12 text-center text-muted-foreground select-none">
              {t("media_library.drop_to_upload")}
            </div>
          )}

          {selectedIds.length > 0 ? (
            <div className="mb-4">
              <MediaBulkBar
                ids={selectedIds}
                onDone={() => setSelected(new Set())}
              />
            </div>
          ) : null}

          {view === "grid" && <GridView items={items} />}
          {view === "list" && <ListView items={items} onOpen={setEditing} />}
          {view === "table" && (
            <TableView
              items={items}
              selectedIds={selected}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              onOpen={setEditing}
              ordering={ordering ?? null}
              onOrderingChange={(value) => setParam("ordering", value)()}
            />
          )}

          <div className="py-5">
            {data && (
              <Pagination
                current={data.pagination.current}
                pages={data.pagination.pages}
                onPageChange={(page) =>
                  setSearchParams((searchParams) => {
                    searchParams.set("page", `${page}`);
                    return searchParams;
                  })
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center">
      <Spinner />
    </div>
  );
}
