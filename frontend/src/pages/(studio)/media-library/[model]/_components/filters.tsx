import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { FilterTrigger } from "@/components/filters/filter-trigger";
import { Search } from "@/components/search";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MultiSelect } from "@/components/ui/multi-select";
import { Toggle } from "@/components/ui/toggle";
import { useMediaTags } from "@/hooks/use-media-tags";
import type { MediaItem } from "@/types";

/**
 * The media library's filters, in the toolbar: a debounced search and —
 * with folders — whether the search stays in the current folder (both
 * in the URL), plus the remembered file types (any-of, a filter chip)
 * and tags (any-of, comma-separated, a searchable select).
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
  const { data: mediaTags } = useMediaTags();

  const toggleType = (type: string) => {
    const next = types.includes(type)
      ? types.filter((current) => current !== type)
      : [...types, type];

    onTypeChange(next.length ? next.join(",") : undefined);
  };

  return (
    <>
      <Search />

      {folders && search && (
        <Toggle
          variant="outline"
          pressed={searchInFolder}
          className="h-8 px-2.5 rounded-lg font-medium text-muted-foreground data-[state=on]:text-foreground"
          onPressedChange={(pressed) =>
            setSearchParams((searchParams) => {
              if (pressed) {
                searchParams.set("searchInFolder", "true");
              } else {
                searchParams.delete("searchInFolder");
              }
              return searchParams;
            })
          }
        >
          {t("media_library.within_folder")}
        </Toggle>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterTrigger
            label={t("media_library.filters.type")}
            value={
              types.length
                ? types
                    .map((type) => t(`media_library.file_types.${type}`))
                    .join(", ")
                : undefined
            }
            onClear={() => onTypeChange(undefined)}
          />
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

      <div className="w-56 max-w-full">
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
          className="min-h-8 py-0.5 rounded-lg shadow-xs text-sm"
          commandProps={{ className: "min-h-8" }}
        />
      </div>
    </>
  );
}
