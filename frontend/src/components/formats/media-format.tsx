import { PiFileBold } from "react-icons/pi";

import type { MediaItem } from "@/types";

function isMediaItem(value: unknown): value is MediaItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "thumbnail" in value
  );
}

export function MediaFormat({ value }: { value: unknown }) {
  if (!isMediaItem(value)) {
    return null;
  }

  return value.type === "image" ? (
    <img
      src={value.thumbnail}
      className="size-8 rounded object-cover shrink-0"
      alt=""
    />
  ) : (
    <div className="size-8 rounded flex items-center justify-center bg-gray-200 shrink-0">
      {value.type === "file" && (
        <span>
          <PiFileBold />
        </span>
      )}
    </div>
  );
}
