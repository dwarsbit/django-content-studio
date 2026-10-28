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
import { PageHeader } from "@/components/page-header";
import { TenantInfo } from "@/components/tenant-info";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { useDiscover } from "@/hooks/use-discover";
import { useListMedia } from "@/hooks/use-list-media";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";

import { MediaBulkBar } from "./_components/bulk-bar";
import { Filters } from "./_components/filters";
import { GridView } from "./_components/grid-view";
import { ListView } from "./_components/list-view";
import { TableView } from "./_components/table-view";
import { UploadsPanel } from "./_components/uploads-panel";

const VIEWS = ["grid", "list", "table"] as const;
const TYPES: MediaItem["type"][] = ["image", "video", "audio", "file"];

export function MediaLibraryPage() {
  return <MediaLibrary />;
}

function MediaLibrary() {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const model = discover?.media_library.models.media_model;
  const hasFolders = discover?.media_library.folders ?? false;

  const [searchParams, setSearchParams] = useSearchParams();
  // The URL keeps what locates the request: the folder, the search
  // term and the page. The view, the type and tags filters and the
  // ordering are remembered per media model, like the content list.
  const page = Number(searchParams.get("page") ?? "1");
  const folder = searchParams.get("folder");
  const search = searchParams.get("search") ?? "";
  const searchInFolder = searchParams.get("searchInFolder") === "true";

  // Reads the remembered view, filters (type and tags) and ordering,
  // dropping values that no longer apply (an unknown view or file
  // type cannot be selected anymore).
  const storedView = (label: string) => {
    const remembered = localStorage.getItem(`__dcs_media_view__:${label}`);

    return remembered && R.includes(remembered, VIEWS) ? remembered : "grid";
  };
  const storedFilters = (label: string) => {
    try {
      const remembered = JSON.parse(
        localStorage.getItem(`__dcs_media_filters__:${label}`) ?? "{}",
      ) as { type?: string; tags?: string };

      return {
        type:
          remembered.type &&
          remembered.type.split(",").every((entry) => R.includes(entry, TYPES))
            ? remembered.type
            : undefined,
        tags: remembered.tags,
      };
    } catch {
      return {};
    }
  };
  const storedOrdering = (label: string) =>
    localStorage.getItem(`__dcs_media_ordering__:${label}`);

  const [view, setViewState] = useState<string>(() =>
    model ? storedView(model) : "grid",
  );
  const [filters, setFiltersState] = useState<{ type?: string; tags?: string }>(
    () => (model ? storedFilters(model) : {}),
  );
  const [ordering, setOrderingState] = useState<string | null>(() =>
    model ? storedOrdering(model) : null,
  );
  const [lastLabel, setLastLabel] = useState(model);

  // A media model appearing (or changing) re-reads the remembered
  // state.
  if (model && model !== lastLabel) {
    setLastLabel(model);
    setViewState(storedView(model));
    setFiltersState(storedFilters(model));
    setOrderingState(storedOrdering(model));
  }

  const { type, tags } = filters;

  const { uploads, start } = useMediaUpload(folder);
  const { data } = useListMedia({
    folder,
    page,
    search,
    searchInFolder,
    type,
    tags,
    ordering: ordering ?? undefined,
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

  // Narrowing or re-sorting the library can strand the current page,
  // so every remembered-state change returns to the first page.
  const resetPage = () =>
    setSearchParams((searchParams) => {
      searchParams.delete("page");
      return searchParams;
    });

  const setView = (next: string) => {
    setViewState(next);

    if (model) {
      localStorage.setItem(`__dcs_media_view__:${model}`, next);
    }

    // Selection is current-page: switching views resets it.
    setSelected(new Set());
  };

  const setFilters = (next: { type?: string; tags?: string }) => {
    setFiltersState(next);

    if (model) {
      if (next.type || next.tags) {
        localStorage.setItem(
          `__dcs_media_filters__:${model}`,
          JSON.stringify(next),
        );
      } else {
        localStorage.removeItem(`__dcs_media_filters__:${model}`);
      }
    }

    resetPage();
    setSelected(new Set());
  };

  const setOrdering = (next: string | null) => {
    setOrderingState(next);

    if (model) {
      if (next) {
        localStorage.setItem(`__dcs_media_ordering__:${model}`, next);
      } else {
        localStorage.removeItem(`__dcs_media_ordering__:${model}`);
      }
    }

    resetPage();
    setSelected(new Set());
  };

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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <TenantInfo label={model} />
      <UploadsPanel uploads={uploads} />
      <ItemEdit
        itemId={editing ?? ""}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />

      <PageHeader
        icon={<PiImageBold />}
        title={t("media_library.title")}
        meta={
          data && (
            <span className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
              {t("media_library.items_count", { count: data.pagination.count })}
            </span>
          )
        }
        actions={<UploadButton folder={folder} multiple onFiles={start} />}
      />

      <div className="mt-6 mb-4 px-6 flex items-start justify-between gap-4">
        <Filters
          folders={hasFolders}
          typeOptions={TYPES}
          type={type}
          tags={tags}
          onTypeChange={(next) => setFilters({ ...filters, type: next })}
          onTagsChange={(next) => setFilters({ ...filters, tags: next })}
        />
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
              onClick={() => setView(name)}
              className={cn(
                "flex items-center justify-center size-6 rounded-md cursor-pointer outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring",
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

      <div className="flex items-start gap-6 px-6 min-h-0">
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
              ordering={ordering}
              onOrderingChange={setOrdering}
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
