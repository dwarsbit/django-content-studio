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

/**
 * The media library's filters: a debounced search and — with folders —
 * whether the search stays in the current folder (both in the URL),
 * plus the remembered file types (any-of) and tags (any-of,
 * comma-separated).
 */
export function Filters({
  folders,
  typeOptions,
  type,
  tags,
  onTypeChange,
  onTagsChange,
}: {
  folders: boolean;
  typeOptions: MediaItem["type"][];
  // The remembered type and tags filters, comma-separated values.
  type?: string;
  tags?: string;
  onTypeChange: (next: string | undefined) => void;
  onTagsChange: (next: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const types = (type ?? "").split(",").filter(Boolean);
  const searchInFolder = searchParams.get("searchInFolder") === "true";

  const [searchLocal, setSearchLocal] = useState(search);
  const { data: mediaTags } = useMediaTags();

  useDebounce(
    () => {
      if ((searchParams.get("search") ?? "") === searchLocal) {
        return;
      }

      // A new term strands the current page, so searching returns to
      // the first page.
      setSearchParams((searchParams) => {
        if (searchLocal) {
          searchParams.set("search", searchLocal);
        } else {
          searchParams.delete("search");
        }
        searchParams.delete("page");
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

    onTypeChange(next.length ? next.join(",") : undefined);
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
          value={(tags ?? "")
            .split(",")
            .filter(Boolean)
            .map((tag) => ({ value: tag, label: tag }))}
          onChange={(options) =>
            onTagsChange(
              options.length
                ? options.map((option) => option.value).join(",")
                : undefined,
            )
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
          {typeOptions.map((type) => (
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
