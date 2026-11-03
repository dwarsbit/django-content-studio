import { useTranslation } from "react-i18next";
import { PiFileBold } from "react-icons/pi";

import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";

import { MAX_CHIPS } from "./chip-list";

function isMediaItem(value: unknown): value is MediaItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "thumbnail" in value
  );
}

function Thumbnail({
  item,
  className,
}: {
  item: MediaItem;
  className?: string;
}) {
  return item.type === "image" ? (
    <img
      src={item.thumbnail}
      className={cn("size-8 rounded object-cover shrink-0", className)}
      alt=""
    />
  ) : (
    <div
      className={cn(
        "size-8 rounded flex items-center justify-center bg-muted shrink-0",
        className,
      )}
    >
      {item.type === "file" && (
        <span>
          <PiFileBold />
        </span>
      )}
    </div>
  );
}

export function MediaFormat({ value }: { value: unknown }) {
  return isMediaItem(value) ? <Thumbnail item={value} /> : null;
}

/** A stack of the first three thumbnails, then "+N". */
export function ManyMediaFormat({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const items = Array.isArray(value) ? value.filter(isMediaItem) : [];

  if (items.length === 0) {
    return null;
  }
  const rest = items.length - MAX_CHIPS;

  return (
    <span className="inline-flex items-center -space-x-2">
      {items.slice(0, MAX_CHIPS).map((item) => (
        <Thumbnail
          key={item.id}
          item={item}
          className="ring-2 ring-background"
        />
      ))}
      {rest > 0 && (
        <span className="size-8 rounded bg-muted ring-2 ring-background flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
          {t("formats.more", { count: rest })}
        </span>
      )}
    </span>
  );
}
