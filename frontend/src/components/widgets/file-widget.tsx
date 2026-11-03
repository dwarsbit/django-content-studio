import bytes from "bytes";
import * as R from "ramda";
import { useContext, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import {
  PiArrowCounterClockwiseBold,
  PiFileBold,
  PiUploadSimpleBold,
} from "react-icons/pi";

import { ResourcePathContext } from "@/components/content-editor/resource-path";
import { Button } from "@/components/ui/button";
import { useHttp } from "@/hooks/use-http";
import { isPickedFile, isSavedFile } from "@/lib/file-value";
import { isSafeHref } from "@/lib/html";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  FieldType,
  type FileValue,
  type Model,
  type ModelField,
  type PickedFile,
  type SavedFile,
  type WidgetProps,
} from "@/types";

interface Upload {
  name: string;
  progress: number;
  controller: AbortController;
}

// Upload errors are keyed by the file ({"file": [...]}).
const uploadErrorMessage = (e: unknown): string =>
  R.pathOr(getErrorMessage(e), ["response", "data", "file", 0], e);

/**
 * A FileField or ImageField. A picked or dropped file is uploaded
 * right away and attached when the object is saved: until then the
 * saved file stays, and Cancel leaves the object unchanged. An
 * ImageField accepts images only and shows a preview.
 */
export function FileWidget({
  field,
  model,
  name,
  value,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
}: {
  field: ModelField;
  model: Model;
  name: string;
  id?: string;
  "aria-describedby"?: string;
} & WidgetProps<FileValue>) {
  const { t } = useTranslation();
  const http = useHttp();
  const resourcePath =
    useContext(ResourcePathContext) ?? `/content/${model.label}`;
  const isImage = field.type === FieldType.ImageField;

  // The file as saved on the object, to go back to.
  const [saved, setSaved] = useState<SavedFile | null>(
    isSavedFile(value) ? value : null,
  );

  if (isSavedFile(value) && value !== saved) {
    setSaved(value);
  }

  const [upload, setUpload] = useState<Upload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A preview of the picked image, by its upload token.
  const [preview, setPreview] = useState<{ token: string; url: string }>();

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const startUpload = async (file: File) => {
    const controller = new AbortController();
    setError(null);
    setUpload({ name: file.name, progress: 0, controller });

    try {
      const { data } = await http.postForm<PickedFile>(
        `${resourcePath}/uploads/${name}`,
        { file },
        {
          signal: controller.signal,
          onUploadProgress: (event) => {
            if (event.total) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setUpload((current) => current && { ...current, progress });
            }
          },
        },
      );

      if (isImage) {
        setPreview({ token: data.upload, url: URL.createObjectURL(file) });
      }
      onChange(data);
    } catch (e: unknown) {
      if (!controller.signal.aborted) {
        setError(uploadErrorMessage(e));
      }
    } finally {
      setUpload(null);
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: isImage ? { "image/*": [] } : undefined,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: upload !== null,
    onDropAccepted: (files) => files[0] && startUpload(files[0]),
    onDropRejected: () => setError(t("widgets.file_widget.not_an_image")),
  });

  const picked = isPickedFile(value) ? value : null;
  const current = picked ?? (isSavedFile(value) ? value : null);
  const isRemoved = !current && saved !== null;
  const thumbnail = picked
    ? preview?.token === picked.upload
      ? preview.url
      : null
    : isImage && current && isSavedFile(current)
      ? ([current.thumbnail, current.url].find(
          (url): url is string => typeof url === "string" && isSafeHref(url),
        ) ?? null)
      : null;

  const chooseButton = (label: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={open}
      aria-describedby={ariaDescribedBy}
    >
      <PiUploadSimpleBold />
      {label}
    </Button>
  );

  return (
    <div className="space-y-1.5">
      <div
        {...getRootProps({
          id,
          className: cn("rounded-md border bg-background p-2", {
            "border-dashed": !current,
            "border-destructive": error,
            "border-2 border-ring ring-3 ring-ring/20": isDragActive,
          }),
        })}
      >
        <input {...getInputProps()} data-testid="file-input" />

        {upload ? (
          <div className="flex items-center gap-3 px-1 py-0.5">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium truncate flex-1">
                  {t("widgets.file_widget.uploading", { name: upload.name })}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {upload.progress}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t("widgets.file_widget.upload_progress")}
                aria-valuenow={upload.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1 rounded-full bg-secondary overflow-hidden"
              >
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => upload.controller.abort()}
            >
              {t("common.cancel")}
            </Button>
          </div>
        ) : current ? (
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground">
              {thumbnail ? (
                <img
                  alt=""
                  src={thumbnail}
                  draggable={false}
                  className="size-full object-cover"
                />
              ) : (
                <PiFileBold className="size-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {isSavedFile(current) && isSafeHref(current.url) ? (
                <a
                  href={current.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium underline-offset-2 hover:underline"
                >
                  {current.name}
                </a>
              ) : (
                <div className="truncate text-sm font-medium">
                  {current.name}
                </div>
              )}
              {picked && (
                <div className="text-xs text-muted-foreground">
                  {[
                    bytes(picked.size),
                    t("widgets.file_widget.attached_on_save"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {chooseButton(t("widgets.file_widget.replace"))}
              {picked && saved ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(saved)}
                >
                  <PiArrowCounterClockwiseBold />
                  {t("widgets.file_widget.keep_saved")}
                </Button>
              ) : (
                (picked || !field.required) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(null)}
                  >
                    {t("widgets.file_widget.remove")}
                  </Button>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 py-0.5">
            {chooseButton(t("widgets.file_widget.choose"))}
            <span className="text-sm text-muted-foreground">
              {isDragActive
                ? t("widgets.file_widget.drop")
                : isRemoved
                  ? t("widgets.file_widget.removed_on_save", {
                      name: saved.name,
                    })
                  : t("widgets.file_widget.empty")}
            </span>
            {isRemoved && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => onChange(saved)}
              >
                <PiArrowCounterClockwiseBold />
                {t("widgets.file_widget.undo")}
              </Button>
            )}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
