import bytes from "bytes";
import * as R from "ramda";
import {
  PiFileAudioBold,
  PiFileBold,
  PiFilePdfBold,
  PiFileVideoBold,
  PiFileZipBold,
  PiImagesBold,
} from "react-icons/pi";

import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";

/** The file's extension in upper case, from its name; empty without one. */
export function extensionOf(item: MediaItem): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(item.name ?? "");

  return match ? match[1].toUpperCase() : "";
}

/** The file's size (stored in bytes), formatted; empty when unknown. */
export function sizeOf(item: Pick<MediaItem, "size">): string {
  return !R.isNil(item.size) && item.size > 0 ? (bytes(item.size) ?? "") : "";
}

/** The meta line of a file: "PNG · 1.2 MB", the type where the name
 * has no extension. */
export function describeFile(item: MediaItem, typeLabel: string): string {
  return [extensionOf(item) || typeLabel, sizeOf(item)]
    .filter(Boolean)
    .join(" · ");
}

/** The icon of a file that has no thumbnail, by extension and type. */
export function FileIcon({
  item,
  className,
}: {
  item: MediaItem;
  className?: string;
}) {
  const extension = extensionOf(item);

  if (extension === "PDF") return <PiFilePdfBold className={className} />;
  if (["ZIP", "GZ", "TAR", "RAR", "7Z"].includes(extension))
    return <PiFileZipBold className={className} />;
  if (item.type === "video") return <PiFileVideoBold className={className} />;
  if (item.type === "audio") return <PiFileAudioBold className={className} />;
  if (item.type === "image") return <PiImagesBold className={className} />;

  return <PiFileBold className={className} />;
}

/** A file's thumbnail, or its type icon on a mist tile. */
export function Thumb({
  item,
  className,
}: {
  item: MediaItem;
  className?: string;
}) {
  return item.type === "image" && item.thumbnail ? (
    <img
      src={item.thumbnail}
      alt=""
      draggable={false}
      className={cn("rounded object-cover shrink-0", className)}
    />
  ) : (
    <span
      className={cn(
        "rounded bg-muted border flex items-center justify-center text-muted-foreground shrink-0 [&_svg]:size-4",
        className,
      )}
    >
      <FileIcon item={item} />
    </span>
  );
}
