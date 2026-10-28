import { useTranslation } from "react-i18next";
import { PiFunnelBold, PiUploadSimpleBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The empty state of the files: a dashed drop zone inviting the first
 * upload, or — while search or filters narrow the library — a
 * no-results notice that offers clearing them.
 */
export function MediaEmptyState({
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
    <EmptyState
      className="rounded-lg border-2 border-dashed"
      icon={filtered ? <PiFunnelBold /> : <PiUploadSimpleBold />}
      title={
        filtered ? t("list_view.no_results") : t("media_library.empty_title")
      }
      description={
        filtered
          ? t("media_library.no_results")
          : t("media_library.empty_description")
      }
      action={
        filtered ? (
          <Button variant="outline" onClick={onClear}>
            {t("list_view.clear_all_filters")}
          </Button>
        ) : (
          <Button onClick={onUpload}>
            <PiUploadSimpleBold />
            {t("widgets.media_widget.upload_label")}
          </Button>
        )
      }
    />
  );
}
