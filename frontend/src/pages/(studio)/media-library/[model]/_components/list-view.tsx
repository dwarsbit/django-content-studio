import bytes from "bytes";
import { useTranslation } from "react-i18next";
import { PiFileBold } from "react-icons/pi";

import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";

/**
 * The media library's list view: one rich row per item — the preview,
 * the name and a meta line of type, size and tags. Like the content
 * list view, it carries no selection: clicking a row opens the item
 * for editing.
 */
export function ListView({
  items,
  onOpen,
}: {
  items: MediaItem[];
  onOpen(id: string): void;
}) {
  const { t } = useTranslation();

  return (
    <div className="border rounded-md divide-y overflow-hidden">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          onClick={() => onOpen(String(item.id))}
          className="w-full flex items-center gap-4 p-2 text-left cursor-pointer hover:bg-accent"
        >
          {item.type === "image" && item.thumbnail ? (
            <img
              draggable={false}
              src={item.thumbnail}
              alt=""
              className="size-10 rounded object-cover shrink-0"
            />
          ) : (
            <span
              className={cn(
                "size-10 rounded bg-muted flex items-center justify-center shrink-0",
              )}
            >
              <PiFileBold className="size-5 text-muted-foreground" />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block font-medium line-clamp-1 break-all">
              {item.name}
            </span>
            <span className="block text-sm text-muted-foreground truncate">
              {t(`media_library.file_types.${item.type}`)}
              {item.size ? ` · ${bytes(item.size * 1000)}` : ""}
              {item.tags.length ? ` · ${item.tags.join(", ")}` : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
