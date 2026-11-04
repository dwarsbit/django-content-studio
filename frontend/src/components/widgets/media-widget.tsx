import * as R from "ramda";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiImage, PiXBold } from "react-icons/pi";

import {
  FileIcon,
  mediaName,
  sizeOf,
  Thumb,
} from "@/components/media-library/file-meta";
import { ItemEdit } from "@/components/media-library/item-edit";
import { SelectDialog } from "@/components/media-library/select-dialog";
import { Button } from "@/components/ui/button";
import { useRetrieveMedia } from "@/hooks/use-retrieve-media";
import type { MediaItem, ModelField, WidgetProps } from "@/types";

export function MediaWidget({
  field,
  value,
  onChange,
}: {
  field: ModelField;
} & WidgetProps<MediaItem | MediaItem[] | null>) {
  // The value shape follows `field.multiple`; the casts narrow at this
  // single dispatch seam, where the runtime flag is the only discriminator.
  return field.multiple ? (
    <MediaGrid
      value={value as MediaItem[] | undefined}
      field={field}
      onChange={onChange as (value: MediaItem[]) => void}
    />
  ) : (
    <SingleMedia
      value={(Array.isArray(value) ? value[0] : value) ?? null}
      field={field}
      onChange={onChange as (value: MediaItem | null) => void}
    />
  );
}

/**
 * The media item whose details are open in the sheet, and the item as
 * the media library has it once the sheet was opened: a name or crop
 * changed there shows in the field without saving the form.
 */
function useMediaDetails(onDeleted: (item: MediaItem) => void) {
  const [openId, setOpenId] = useState<string | null>(null);
  // The last item opened, kept after closing for the close animation and
  // for its fresher copy.
  const [inspectedId, setInspectedId] = useState("");
  const { data: fresh } = useRetrieveMedia(inspectedId);

  const sheet = (
    <ItemEdit
      itemId={inspectedId}
      open={openId !== null}
      onClose={() => setOpenId(null)}
      onDeleted={onDeleted}
    />
  );

  return {
    sheet,
    open(item: MediaItem) {
      setInspectedId(String(item.id));
      setOpenId(String(item.id));
    },
    // The library's copy of an item, once its details were opened.
    current<T extends MediaItem>(item: T): T {
      return fresh && String(fresh.id) === String(item.id)
        ? { ...item, ...fresh }
        : item;
    },
  };
}

function SingleMedia({
  value,
  field,
  onChange,
}: {
  value: MediaItem | null;
  field: ModelField;
  onChange: (value: MediaItem | null) => void;
}) {
  const { t } = useTranslation();
  const details = useMediaDetails(() => onChange?.(null));

  const chooser = (
    <SelectDialog
      multiple={!!field.multiple}
      onSelect={(v) => onChange?.(Array.isArray(v) ? (v[0] ?? null) : v)}
    >
      <Button variant="outline" size="sm" type="button">
        {value ? (
          t("widgets.media_widget.replace")
        ) : (
          <>
            <PiImage />
            {t("widgets.media_widget.select_media")}
          </>
        )}
      </Button>
    </SelectDialog>
  );

  if (!value) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed bg-background p-2 pr-3">
        <span className="size-14 shrink-0 rounded bg-muted flex items-center justify-center text-muted-foreground">
          <PiImage className="size-5" />
        </span>
        <div className="flex-1 min-w-0 text-sm text-muted-foreground">
          {t("widgets.media_widget.empty")}
        </div>
        {!field.readonly && chooser}
      </div>
    );
  }

  const item = details.current(value);
  const name = mediaName(item);
  const size = sizeOf(item);

  return (
    <div className="flex items-center gap-3 rounded-md border bg-background p-2 pr-3">
      {details.sheet}
      <button
        type="button"
        className="shrink-0 rounded cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:opacity-80 transition-opacity"
        aria-label={t("widgets.media_widget.show_details", { name })}
        title={t("widgets.media_widget.show_details", { name })}
        onClick={() => details.open(item)}
      >
        <Thumb item={item} className="size-14 [&_svg]:size-5" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" title={name}>
          {name}
        </div>
        <div className="text-xs text-muted-foreground">
          {t(`media_library.file_types.${item.type}`)}
          {size ? ` · ${size}` : ""}
        </div>
      </div>
      {!field.readonly && chooser}
      {!field.required && !field.readonly && (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="text-muted-foreground"
          onClick={(e) => {
            e.preventDefault();
            onChange?.(null);
          }}
        >
          <PiXBold />
          {t("widgets.media_widget.remove")}
        </Button>
      )}
    </div>
  );
}

/**
 * Several media items as a grid of tiles; a tile opens the item's
 * details, the cross on it removes the item from the field.
 */
export function MediaGrid({
  value,
  field,
  onChange,
}: {
  value?: MediaItem[];
  field: ModelField;
  onChange: (value: MediaItem[]) => void;
}) {
  const { t } = useTranslation();
  const details = useMediaDetails((deleted) =>
    onChange?.(R.reject(R.whereEq({ id: deleted.id }), value ?? [])),
  );

  return (
    <div className="grid grid-cols-4 gap-2">
      {details.sheet}
      {value?.map((original, idx) => {
        const item = details.current(original);
        const name = mediaName(item);

        return (
          <div
            key={idx}
            className="aspect-square relative flex items-center shrink-0 group"
          >
            <button
              type="button"
              className="size-full rounded-md overflow-hidden cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label={t("widgets.media_widget.show_details", { name })}
              title={name}
              onClick={() => details.open(item)}
            >
              {item.type === "image" && item.thumbnail ? (
                <img
                  src={item.thumbnail}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                />
              ) : (
                <span className="size-full bg-muted border rounded-md flex flex-col gap-1.5 items-center justify-center p-2 text-muted-foreground">
                  <FileIcon item={item} className="size-6 shrink-0" />
                  <span className="text-xs font-medium text-foreground w-full truncate text-center">
                    {name}
                  </span>
                </span>
              )}
            </button>
            {!field.readonly && (
              <button
                type="button"
                aria-label={t("widgets.media_widget.remove")}
                className="absolute top-1 right-1 bg-background/90 text-foreground rounded p-1.5 cursor-pointer invisible group-hover:visible focus-visible:visible"
                onClick={(e) => {
                  e.preventDefault();
                  onChange?.(R.reject(R.whereEq({ id: item.id }), value ?? []));
                }}
              >
                <PiXBold />
              </button>
            )}
          </div>
        );
      })}

      {!field.readonly && (
        <SelectDialog
          multiple
          onSelect={(v) =>
            onChange?.([...(value ?? []), ...(Array.isArray(v) ? v : [v])])
          }
        >
          <button
            type="button"
            className="cursor-pointer aspect-square flex flex-col gap-1 items-center justify-center border border-dashed border-border hover:border-ring text-muted-foreground text-center text-sm font-medium rounded-md p-1"
          >
            <PiImage className="size-6" />
            {t("widgets.media_widget.select_media")}
          </button>
        </SelectDialog>
      )}
    </div>
  );
}
