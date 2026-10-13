import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaPhotoVideo } from "react-icons/fa";
import { useSearchParams } from "react-router";
import { useDebounce } from "react-use";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { useMediaTags } from "@/hooks/use-media-tags";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";

const TYPES: MediaItem["type"][] = ["image", "video", "audio", "file"];

/**
 * The media library's filters, all in the URL: a debounced search,
 * the file types (any-of), the tags (any-of, comma-separated) and —
 * with folders — whether the search stays in the current folder.
 */
export function Filters({ folders }: { folders: boolean }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const types = (searchParams.get("type") ?? "").split(",").filter(Boolean);
  const tags = searchParams.get("tags") ?? "";
  const searchInFolder = searchParams.get("searchInFolder") === "true";

  const [searchLocal, setSearchLocal] = useState(search);
  const { data: mediaTags } = useMediaTags();

  useDebounce(
    () => {
      if ((searchParams.get("search") ?? "") === searchLocal) {
        return;
      }

      setSearchParams((searchParams) => {
        if (searchLocal) {
          searchParams.set("search", searchLocal);
        } else {
          searchParams.delete("search");
        }
        return searchParams;
      });
    },
    300,
    [searchLocal, searchParams, setSearchParams],
  );

  const toggleType = (type: string) => {
    const next = types.includes(type)
      ? types.filter((current) => current !== type)
      : [...types, type];

    setSearchParams((searchParams) => {
      if (next.length) {
        searchParams.set("type", next.join(","));
      } else {
        searchParams.delete("type");
      }
      return searchParams;
    });
  };

  return (
    <div className="flex flex-1 items-center gap-2 flex-wrap">
      <Input
        className="w-[260px] shrink-0 max-w-full"
        placeholder={t("common.search")}
        value={searchLocal}
        onChange={(e) => setSearchLocal(e.target.value)}
      />

      <div className="w-[240px] max-w-full">
        <MultiSelect
          options={(mediaTags ?? []).map((tag) => ({ value: tag, label: tag }))}
          value={tags
            .split(",")
            .filter(Boolean)
            .map((tag) => ({ value: tag, label: tag }))}
          onChange={(options) =>
            setSearchParams((searchParams) => {
              const value = options.map((option) => option.value).join(",");
              if (value) {
                searchParams.set("tags", value);
              } else {
                searchParams.delete("tags");
              }
              return searchParams;
            })
          }
          placeholder={t("media_library.filters.tags")}
          emptyIndicator={t("media_library.filters.no_tags")}
          hidePlaceholderWhenSelected
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "h-8 px-3 inline-flex items-center gap-1.5 rounded-md border bg-background text-sm font-medium whitespace-nowrap cursor-pointer hover:bg-accent",
            types.length > 0 && "bg-accent",
          )}
        >
          <FaPhotoVideo />
          {types.length
            ? types
                .map((type) => t(`media_library.file_types.${type}`))
                .join(", ")
            : t("media_library.filters.type")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {TYPES.map((type) => (
            <DropdownMenuCheckboxItem
              key={type}
              checked={types.includes(type)}
              onSelect={(e) => {
                e.preventDefault();
                toggleType(type);
              }}
            >
              {t(`media_library.file_types.${type}`)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {folders && search && (
        <button
          type="button"
          className={cn(
            "h-8 px-3 rounded-md border bg-background text-sm font-medium whitespace-nowrap cursor-pointer hover:bg-accent",
            searchInFolder && "bg-accent",
          )}
          onClick={() =>
            setSearchParams((searchParams) => {
              if (searchInFolder) {
                searchParams.delete("searchInFolder");
              } else {
                searchParams.set("searchInFolder", "true");
              }
              return searchParams;
            })
          }
        >
          {t("media_library.within_folder")}
        </button>
      )}
    </div>
  );
}
