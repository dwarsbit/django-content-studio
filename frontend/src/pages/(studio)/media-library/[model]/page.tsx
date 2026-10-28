import * as R from "ramda";
import { useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import {
  PiImagesBold,
  PiRowsBold,
  PiSquaresFourBold,
  PiTableBold,
  PiUploadSimpleBold,
} from "react-icons/pi";
import { useSearchParams } from "react-router";

import { FilterTrigger } from "@/components/filters/filter-trigger";
import { FolderPath } from "@/components/media-library/folder-path";
import { FolderPicker } from "@/components/media-library/folder-picker";
import { Folders } from "@/components/media-library/folders";
import { ItemEdit } from "@/components/media-library/item-edit";
import { PageBody, PageHeader, Toolbar } from "@/components/page-header";
import { TenantInfo } from "@/components/tenant-info";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDiscover } from "@/hooks/use-discover";
import { useFolderPath } from "@/hooks/use-folder-path";
import { useListMedia } from "@/hooks/use-list-media";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";

import { MediaBulkBar } from "./_components/bulk-bar";
import { EmptyState } from "./_components/empty-state";
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
  // The file opened in the details sheet.
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

  const selectFolder = (folder: string | null) =>
    setSearchParams((searchParams) => {
      if (folder) {
        searchParams.set("folder", folder);
      } else {
        searchParams.delete("folder");
      }
      searchParams.delete("page");
      return searchParams;
    });

  const clearAll = () => {
    setFilters({});
    setSearchParams((searchParams) => {
      searchParams.delete("search");
      searchParams.delete("searchInFolder");
      searchParams.delete("page");
      return searchParams;
    });
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

  // One file input serves the header's Upload button and the empty
  // state's; dropping files anywhere on the page uploads them too.
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => inputRef.current?.click();
  const { getRootProps, isDragActive } = useDropzone({
    onDrop: start,
    noClick: true,
    noKeyboard: true,
  });

  const items = data?.results ?? [];
  const selectedIds = items
    .map((item) => String(item.id))
    .filter((id) => selected.has(id));
  const filtered = Boolean(search || type || tags);
  // A search across the library has no folder to show.
  const showFolders = hasFolders && !(search && !searchInFolder);

  if (!model) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <TenantInfo label={model} />
      <UploadsPanel uploads={uploads} />
      <ItemEdit
        itemId={editing ?? ""}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            start(Array.from(e.target.files));
            e.target.value = "";
          }
        }}
      />

      <PageHeader
        icon={<PiImagesBold />}
        title={t("media_library.title")}
        meta={
          data && (
            <span className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
              {t("media_library.items_count", { count: data.pagination.count })}
            </span>
          )
        }
        actions={
          <Button onClick={openPicker}>
            <PiUploadSimpleBold />
            {t("widgets.media_widget.upload_label")}
          </Button>
        }
      >
        <Toolbar>
          <Filters
            folders={hasFolders}
            typeOptions={TYPES}
            type={type}
            tags={tags}
            onTypeChange={(next) => setFilters({ ...filters, type: next })}
            onTagsChange={(next) => setFilters({ ...filters, tags: next })}
          />
          {showFolders && (
            <span className="md:hidden">
              <FolderChip folder={folder} onSelect={selectFolder} />
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={view}
              onValueChange={(next) => next && setView(next)}
              aria-label={t("list_view.view")}
            >
              {(
                [
                  ["grid", <PiSquaresFourBold key="grid" />, "grid_view"],
                  ["list", <PiRowsBold key="list" />, "list_view"],
                  ["table", <PiTableBold key="table" />, "table_view"],
                ] as const
              ).map(([name, icon, label]) => (
                <ToggleGroupItem
                  key={name}
                  value={name}
                  title={t(`media_library.${label}`)}
                  aria-label={t(`media_library.${label}`)}
                  className="min-w-8"
                >
                  {icon}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </Toolbar>
      </PageHeader>

      <PageBody>
        <div
          {...getRootProps()}
          className="relative flex gap-6 items-start outline-none"
        >
          {showFolders && (
            <aside className="hidden md:block w-52 shrink-0 sticky top-0">
              <Folders current={folder} onSelect={selectFolder} />
            </aside>
          )}

          <div className="flex-1 min-w-0 space-y-3">
            {showFolders && (
              <FolderPath folder={folder} onSelect={selectFolder} />
            )}

            {isDragActive && (
              <div className="absolute inset-0 z-10 rounded-lg border-2 border-dashed border-ring bg-background/80 flex items-center justify-center text-sm font-medium select-none pointer-events-none">
                <span className="flex items-center gap-2">
                  <PiUploadSimpleBold className="size-4" />
                  {t("media_library.drop_to_upload")}
                </span>
              </div>
            )}

            {data && items.length === 0 ? (
              <EmptyState
                filtered={filtered}
                onClear={clearAll}
                onUpload={openPicker}
              />
            ) : (
              <>
                {view === "grid" && (
                  <GridView
                    items={items}
                    selected={selected}
                    onToggle={toggleSelect}
                    onOpen={setEditing}
                  />
                )}
                {view === "list" && (
                  <ListView
                    items={items}
                    selected={selected}
                    onToggle={toggleSelect}
                    onOpen={setEditing}
                  />
                )}
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
              </>
            )}

            {data && items.length > 0 && (
              <div
                className={cn(
                  "flex items-center justify-between gap-4 text-sm text-muted-foreground",
                )}
              >
                <span className="tabular-nums select-none">
                  {t("media_library.items_count", {
                    count: data.pagination.count,
                  })}
                  {data.pagination.pages > 1 &&
                    ` · ${t("list_view.page_of", data.pagination)}`}
                </span>
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
              </div>
            )}
          </div>
        </div>
      </PageBody>

      {selectedIds.length > 0 && (
        <MediaBulkBar
          ids={selectedIds}
          folders={hasFolders}
          onDone={() => setSelected(new Set())}
        />
      )}
    </>
  );
}

/**
 * The folder chip of narrow screens, where the folder tree is hidden:
 * the current folder's name, opening the folder picker.
 */
function FolderChip({
  folder,
  onSelect,
}: {
  folder: string | null;
  onSelect(folder: string | null): void;
}) {
  const { t } = useTranslation();
  const { data: folderPath } = useFolderPath(folder);
  const current = folder ? folderPath?.at(-1) : undefined;

  return (
    <FolderPicker
      trigger={
        <FilterTrigger
          label={t("media_library.filters.folder")}
          value={current?.name}
          onClear={() => onSelect(null)}
        />
      }
      onSelect={onSelect}
    />
  );
}
