import { useTranslation } from "react-i18next";
import { PiCheckBold } from "react-icons/pi";

import type { UploadEntry } from "@/hooks/use-media-upload";

/**
 * The uploads panel: one progress bar per file in flight, bottom
 * right; a completed entry shows its checkmark briefly before it
 * clears itself.
 */
export function UploadsPanel({ uploads }: { uploads: UploadEntry[] }) {
  const { t } = useTranslation();

  if (uploads.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 border rounded-lg bg-card p-3 space-y-3 shadow-lg shadow-foreground/5">
      {uploads.map((upload) => (
        <div key={upload.id}>
          <div className="flex items-center gap-2 text-sm">
            {upload.done && <PiCheckBold className="size-3.5 text-success" />}
            <span className="flex-1 line-clamp-1">{upload.name}</span>
            <span className="text-muted-foreground text-xs">
              {upload.done ? t("common.done") : `${upload.progress}%`}
            </span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${upload.progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
