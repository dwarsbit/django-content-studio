import { useTranslation } from "react-i18next";

import { describeFile, Thumb } from "@/components/media-library/file-meta";
import { ItemActions } from "@/components/media-library/item-card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";

/**
 * The media library's list view: one row per file — the preview, the
 * name with its meta line, the tags — with the row anatomy of the
 * content list: a checkbox on hover selects, clicking the row opens
 * the file, the more button holds its actions.
 */
export function ListView({
  items,
  selected,
  onToggle,
  onOpen,
}: {
  items: MediaItem[];
  selected: Set<string>;
  onToggle(id: string): void;
  onOpen(id: string): void;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {items.map((item) => {
        const id = String(item.id);
        const isSelected = selected.has(id);

        return (
          <div
            key={item.id}
            data-slot="media-row"
            className={cn(
              "group flex items-center gap-3 pl-3 pr-2 border-b last:border-b-0 hover:bg-muted",
              { "bg-accent": isSelected },
            )}
          >
            <span
              className={cn(
                "flex items-center transition-opacity",
                isSelected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
              )}
            >
              <Checkbox
                checked={isSelected}
                aria-label={t("common.select_item")}
                onCheckedChange={() => onToggle(id)}
              />
            </span>
            <button
              type="button"
              onClick={() => onOpen(id)}
              className="flex-1 min-w-0 flex items-center gap-3 py-2 text-left cursor-pointer outline-none rounded-md focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Thumb item={item} className="size-10" />
              <span className="flex-1 min-w-0">
                <span className="block font-medium truncate">{item.name}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {describeFile(
                    item,
                    t(`media_library.file_types.${item.type}`),
                  )}
                </span>
              </span>
            </button>
            {item.tags.length > 0 && (
              <span className="hidden md:flex items-center gap-1">
                {item.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-muted-foreground"
                  >
                    {tag}
                  </Badge>
                ))}
              </span>
            )}
            <ItemActions
              item={item}
              variant="ghost"
              onOpen={() => onOpen(id)}
              className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            />
          </div>
        );
      })}
    </div>
  );
}
