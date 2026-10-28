import { useTranslation } from "react-i18next";
import { PiFunnelBold, PiUploadSimpleBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";

/**
 * The empty state of the files: a dashed drop zone inviting the first
 * upload, or — while search or filters narrow the library — a
 * no-results notice that offers clearing them.
 */
export function EmptyState({
  filtered,
  onClear,
  onUpload,
}: {
  // Whether a search term or remembered filters narrow the library.
  filtered: boolean;
  // Clears the search term and the remembered filters.
  onClear(): void;
  // Opens the file picker.
  onUpload(): void;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border-2 border-dashed py-16 px-6 flex flex-col items-center text-center">
      <div className="size-10 rounded-full bg-muted border flex items-center justify-center text-muted-foreground [&_svg]:size-5 mb-3">
        {filtered ? <PiFunnelBold /> : <PiUploadSimpleBold />}
      </div>
      {filtered ? (
        <>
          <div className="font-medium">{t("list_view.no_results")}</div>
          <div className="text-muted-foreground text-sm max-w-sm mt-1">
            {t("media_library.no_results")}
          </div>
          <Button variant="outline" className="mt-4" onClick={onClear}>
            {t("list_view.clear_all_filters")}
          </Button>
        </>
      ) : (
        <>
          <div className="font-medium">{t("media_library.empty_title")}</div>
          <div className="text-muted-foreground text-sm max-w-sm mt-1">
            {t("media_library.empty_description")}
          </div>
          <Button className="mt-4" onClick={onUpload}>
            <PiUploadSimpleBold />
            {t("widgets.media_widget.upload_label")}
          </Button>
        </>
      )}
    </div>
  );
}
