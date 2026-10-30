import * as R from "ramda";
import { type ReactNode, useId, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import {
  PiArrowsLeftRightBold,
  PiCrosshairBold,
  PiImageBold,
  PiUploadSimpleBold,
  PiWarningCircleBold,
  PiXBold,
} from "react-icons/pi";
import { toast } from "sonner";

import { sizeOf } from "@/components/media-library/file-meta";
import { SelectDialog } from "@/components/media-library/select-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateMedia } from "@/hooks/use-create-media";
import { useDiscover } from "@/hooks/use-discover";
import { useRetrieveMedia } from "@/hooks/use-retrieve-media";
import { useUpdateMedia } from "@/hooks/use-update-media";
import { dimensionsOf, metadataOf } from "@/lib/media-metadata";
import { cn, getErrorMessage } from "@/lib/utils";
import type {
  CoverImageWidgetOptions,
  FocalPointValue,
  MediaItem,
  ModelField,
  WidgetProps,
} from "@/types";

import { FocalPointDialog } from "./focal-point-dialog";
import { focalPointPosition } from "./focal-point-position";
import { parseAspectRatio, useImageSize } from "./image-size";

// The field's value: the related item as the API represents it, or a
// full media item once one is chosen or uploaded.
type CoverValue = Pick<MediaItem, "id"> & Partial<MediaItem>;

interface Upload {
  name: string;
  progress: number;
  preview: string;
  controller: AbortController;
}

// Upload errors are keyed by field ({"file": [...]}); others carry a detail.
const uploadErrorMessage = (e: unknown): string =>
  R.pathOr(getErrorMessage(e), ["response", "data", "file", 0], e);

/**
 * One image shown large, in a 16:9 frame (or the aspect_ratio option's):
 * for a cover or header image.
 * An image can be dropped on the frame, uploaded or chosen from the
 * media library. Alt text and the focal point are edited on the media
 * item itself, so they apply wherever the image is used. With min_width
 * or min_height, an image smaller than that gets a warning.
 */
export function CoverImageWidget({
  field,
  value,
  onChange,
  options = {},
}: {
  field: ModelField;
} & WidgetProps<CoverValue | null, CoverImageWidgetOptions>) {
  const { t } = useTranslation();
  const { min_width: minWidth, min_height: minHeight } = options;
  const [ratioWidth, ratioHeight] = parseAspectRatio(options.aspect_ratio);
  const { data: discover } = useDiscover();
  const focalPointAttr = discover?.media_library.focal_point ?? null;
  const readonly = !!field.readonly;

  const itemId = value?.id != null ? String(value.id) : "";
  const { data: retrieved } = useRetrieveMedia(itemId);
  // The retrieve keeps the previous item while the next one loads.
  const item =
    retrieved && String(retrieved.id) === itemId ? retrieved : undefined;

  const [upload, setUpload] = useState<Upload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focalPointOpen, setFocalPointOpen] = useState(false);
  const { mutateAsync: createMedia } = useCreateMedia();

  const select = (media: MediaItem) => {
    if (media.type !== "image") {
      setError(t("widgets.cover_image_widget.not_an_image"));
      return;
    }

    setError(null);
    onChange?.(media);
  };

  const startUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError(t("widgets.cover_image_widget.not_an_image"));
      return;
    }

    const controller = new AbortController();
    const preview = URL.createObjectURL(file);
    setError(null);
    setUpload({ name: file.name, progress: 0, preview, controller });

    try {
      const created = await createMedia({
        folder: null,
        name: file.name,
        file,
        type: "image",
        signal: controller.signal,
        onProgress: (progress) =>
          setUpload((current) => current && { ...current, progress }),
      });
      onChange?.(created);
    } catch (e: unknown) {
      if (!controller.signal.aborted) {
        setError(uploadErrorMessage(e));
      }
    } finally {
      setUpload(null);
      URL.revokeObjectURL(preview);
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: readonly || upload !== null,
    onDropAccepted: (files) => files[0] && startUpload(files[0]),
    onDropRejected: () =>
      setError(t("widgets.cover_image_widget.not_an_image")),
  });

  const thumbnail = value?.thumbnail ?? item?.thumbnail;
  // The image's size: from its stored metadata, or else measured on
  // the file (thumbnails are scaled down) when a minimum size needs it.
  const storedSize = dimensionsOf(
    metadataOf(item, discover?.media_library.metadata),
  );
  const measuredSize = useImageSize(
    !storedSize && (minWidth || minHeight) && item?.type === "image"
      ? item.file
      : null,
  );
  const imageSize = storedSize ?? measuredSize;
  const isTooSmall =
    imageSize !== null &&
    ((minWidth !== undefined && imageSize.width < minWidth) ||
      (minHeight !== undefined && imageSize.height < minHeight));
  const minSize =
    minWidth && minHeight
      ? t("widgets.cover_image_widget.min_size", {
          width: minWidth,
          height: minHeight,
        })
      : minWidth
        ? t("widgets.cover_image_widget.min_width", { width: minWidth })
        : minHeight
          ? t("widgets.cover_image_widget.min_height", { height: minHeight })
          : null;
  const ratio = `${ratioWidth}:${ratioHeight}`;
  const sizeHint = t(
    ratioWidth > ratioHeight
      ? "widgets.cover_image_widget.size_hint"
      : ratioWidth < ratioHeight
        ? "widgets.cover_image_widget.size_hint_portrait"
        : "widgets.cover_image_widget.size_hint_square",
    { ratio },
  );
  const focalPoint = focalPointAttr
    ? ((
        item as unknown as Record<string, FocalPointValue | null> | undefined
      )?.[focalPointAttr] ?? null)
    : null;

  const chooser = (label: ReactNode, className?: string) => (
    <SelectDialog
      multiple={false}
      onSelect={(media) => select(Array.isArray(media) ? media[0] : media)}
    >
      <Button type="button" variant="outline" size="sm" className={className}>
        {label}
      </Button>
    </SelectDialog>
  );

  return (
    <div className="space-y-2">
      <div
        {...getRootProps({
          className: cn(
            "group relative overflow-hidden rounded-md border bg-muted",
            {
              "border-dashed": !value && !upload,
              "border-destructive": error && !value,
              "border-2 border-ring ring-3 ring-ring/20": isDragActive,
            },
          ),
          style: { aspectRatio: `${ratioWidth} / ${ratioHeight}` },
        })}
      >
        <input {...getInputProps()} data-testid="cover-image-input" />

        {upload ? (
          <img
            alt=""
            src={upload.preview}
            draggable={false}
            className="absolute inset-0 size-full object-cover opacity-45 blur-[2px]"
          />
        ) : value && thumbnail ? (
          <img
            alt={item?.alt_text ?? ""}
            src={thumbnail}
            draggable={false}
            className="absolute inset-0 size-full object-cover"
            style={{ objectPosition: focalPointPosition(focalPoint) }}
          />
        ) : null}

        {isDragActive ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center bg-accent/90">
            <span className="size-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
              <PiUploadSimpleBold className="size-5" />
            </span>
            <div>
              <div className="text-sm font-medium">
                {t("widgets.cover_image_widget.drop")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("widgets.cover_image_widget.drop_hint")}
              </div>
            </div>
          </div>
        ) : upload ? (
          <div className="absolute inset-x-4 bottom-4 rounded-md bg-background/95 shadow-md px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium truncate flex-1">
                {t("widgets.cover_image_widget.uploading", {
                  name: upload.name,
                })}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {upload.progress}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => upload.controller.abort()}
              >
                {t("common.cancel")}
              </Button>
            </div>
            <div
              role="progressbar"
              aria-label={t("widgets.cover_image_widget.upload_progress")}
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
        ) : !value ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <span className="size-10 rounded-md bg-accent text-muted-foreground flex items-center justify-center">
              <PiImageBold className="size-5" />
            </span>
            {readonly ? (
              <div className="text-sm text-muted-foreground">
                {t("widgets.cover_image_widget.no_image")}
              </div>
            ) : (
              <>
                <div>
                  <div className="text-sm font-medium">
                    {t("widgets.cover_image_widget.empty_title")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("widgets.cover_image_widget.empty_hint")}
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {chooser(t("widgets.cover_image_widget.choose"))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={open}
                  >
                    {t("widgets.cover_image_widget.upload")}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          !readonly && (
            <div className="absolute right-3 bottom-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {focalPointAttr && item && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-background/90"
                  onClick={() => setFocalPointOpen(true)}
                >
                  <PiCrosshairBold />
                  {t("widgets.cover_image_widget.focal_point")}
                </Button>
              )}
              {chooser(
                <>
                  <PiArrowsLeftRightBold />
                  {t("widgets.cover_image_widget.replace")}
                </>,
                "bg-background/90",
              )}
              {!field.required && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="bg-background/90"
                  aria-label={t("widgets.cover_image_widget.remove")}
                  onClick={() => {
                    setError(null);
                    onChange?.(null);
                  }}
                >
                  <PiXBold />
                </Button>
              )}
            </div>
          )
        )}
      </div>

      {value && !upload && item && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <PiImageBold className="size-3.5 shrink-0" />
          <span className="font-medium text-foreground truncate">
            {item.name}
          </span>
          <span className="tabular-nums shrink-0">{sizeOf(item)}</span>
          {imageSize && (
            <span className="tabular-nums shrink-0">
              {imageSize.width} × {imageSize.height} px
            </span>
          )}
        </div>
      )}

      {value && !upload && isTooSmall && (
        <div className="flex items-start gap-1.5 text-xs text-warning">
          <PiWarningCircleBold className="size-3.5 mt-0.5 shrink-0" />
          <span>
            {t("widgets.cover_image_widget.too_small", { min: minSize })}
          </span>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-1.5 text-xs text-destructive"
        >
          <PiWarningCircleBold className="size-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        !value &&
        !readonly && (
          <div className="text-xs text-muted-foreground">
            {sizeHint}
            {minSize &&
              ` ${t("widgets.cover_image_widget.size_hint_min", { min: minSize })}`}
          </div>
        )
      )}

      {/* Sites can leave alt_text out of the media item's fields. */}
      {value && item && "alt_text" in item && (
        <AltTextInput
          // A new item, or alt text changed elsewhere, starts afresh.
          key={`${item.id}:${item.alt_text}`}
          item={item}
          readonly={readonly}
        />
      )}

      {focalPointAttr && item && (
        <FocalPointDialog
          item={item}
          attr={focalPointAttr}
          open={focalPointOpen}
          onOpenChange={setFocalPointOpen}
        />
      )}
    </div>
  );
}

/**
 * The media item's alt text, saved on the item when the input loses
 * focus.
 */
function AltTextInput({
  item,
  readonly,
}: {
  item: MediaItem;
  readonly: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const { mutateAsync } = useUpdateMedia();
  const [altText, setAltText] = useState(item.alt_text ?? "");
  // The last value saved (or loaded), to skip saves without a change.
  const saved = useRef(item.alt_text ?? "");

  const save = async () => {
    if (altText === saved.current) {
      return;
    }

    try {
      await mutateAsync({ id: item.id, alt_text: altText });
      saved.current = altText;
      toast.success(t("widgets.cover_image_widget.alt_text_saved"));
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-1.5 pt-1">
      <Label htmlFor={id}>{t("widgets.cover_image_widget.alt_text")}</Label>
      <Input
        id={id}
        value={altText}
        readOnly={readonly}
        onChange={(e) => setAltText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          // Enter saves the alt text, not the page's form.
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <div className="text-xs text-muted-foreground">
        {t("widgets.cover_image_widget.alt_text_hint")}
      </div>
    </div>
  );
}
