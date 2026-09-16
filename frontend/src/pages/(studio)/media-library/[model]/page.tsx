import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiImageBold } from "react-icons/pi";
import { useSearchParams } from "react-router";

import { FolderPath } from "@/components/media-library/folder-path";
import { Folders } from "@/components/media-library/folders";
import { UploadButton } from "@/components/media-library/upload-button";
import { TenantInfo } from "@/components/tenant-info";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { useDiscover } from "@/hooks/use-discover";
import { useListMedia } from "@/hooks/use-list-media";
import { cn } from "@/lib/utils";

import { Filters } from "./_components/filters";
import { GridView } from "./_components/grid-view";

export function MediaLibraryPage() {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const model = discover?.media_library.models.media_model;
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const folder = searchParams.get("folder");
  const [filters, setFilters] = useState<{
    search: string;
    searchInFolder: boolean;
  }>({
    search: "",
    searchInFolder: false,
  });
  const { data } = useListMedia({ folder, page, filters });

  return model && data ? (
    <div className="flex flex-col overflow-hidden">
      <TenantInfo label={model} />

      <div className="flex items-center gap-4 mb-6 py-3 px-5 border-b">
        <PiImageBold size={20} className="shrink-0" />
        <div className="flex-1">
          <h1 className="text-xl/tight font-semibold mb-0.5">
            {t("media_library.title")}
          </h1>
          {discover.media_library.folders ? (
            <div
              className={cn({
                invisible: filters.search && !filters.searchInFolder,
              })}
            >
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
          ) : (
            <div className="text-muted-foreground">
              {t("media_library.description")}
            </div>
          )}
        </div>
        <UploadButton folder={folder} multiple />
      </div>

      <div className="mb-4 px-5">
        <Filters filters={filters} onFilterChange={setFilters} />
      </div>

      {discover.media_library.folders && (
        <div
          className={cn("mb-4 px-5", {
            hidden: filters.search && !filters.searchInFolder,
          })}
        >
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

      <div className="px-5 overflow-y-auto scrollbar flex-1">
        <GridView items={data.results} />

        <div className="py-5">
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
      </div>
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center">
      <Spinner />
    </div>
  );
}
