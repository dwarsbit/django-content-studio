import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { PiUploadSimpleBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { useUpload } from "@/hooks/use-upload";
import type { Id } from "@/types";

export function UploadButton({
  folder = null,
  multiple = false,
  onFiles,
  ...props
}: React.ComponentProps<typeof Button> & {
  folder?: Id | null;
  multiple?: boolean;
  /** Overrides the default toast-based upload (the media library's
   * page routes files through its progress-tracking upload). */
  onFiles?(files: File[]): void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useUpload();

  return (
    <>
      <Button
        {...props}
        className="select-none text-sm font-medium"
        onClick={() => inputRef.current?.click()}
      >
        <PiUploadSimpleBold />
        {t("widgets.media_widget.upload_label")}
      </Button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={multiple}
        onChange={async (e) => {
          const { files } = e.target;
          if (files) {
            if (onFiles) {
              onFiles(Array.from(files));
            } else {
              await handleUpload(Array.from(files), folder);
            }
          }
        }}
      />
    </>
  );
}
