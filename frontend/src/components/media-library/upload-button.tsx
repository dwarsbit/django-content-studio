import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { PiUpload } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { useUpload } from "@/hooks/use-upload";
import type { Id } from "@/types";

export function UploadButton({
  folder = null,
  multiple = false,
  ...props
}: React.ComponentProps<typeof Button> & {
  folder?: Id | null;
  multiple?: boolean;
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
        <PiUpload />
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
            await handleUpload(Array.from(files), folder);
          }
        }}
      />
    </>
  );
}
