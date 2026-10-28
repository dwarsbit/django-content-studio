import bytes from "bytes";
import * as R from "ramda";
import React from "react";
import { useTranslation } from "react-i18next";
import { PiFileBold, PiImage, PiXBold } from "react-icons/pi";

import { SelectDialog } from "@/components/media-library/select-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
    <MultipleMedia
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

  return (
    <div className="flex items-center gap-3 rounded-md border bg-background p-2 pr-3">
      {value.type === "image" && value.thumbnail ? (
        <img
          src={value.thumbnail}
          alt=""
          draggable={false}
          className="size-14 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="size-14 shrink-0 rounded bg-muted border flex items-center justify-center text-muted-foreground">
          <PiFileBold className="size-5" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{value.name}</div>
        <div className="text-xs text-muted-foreground">
          {t(`media_library.file_types.${value.type}`)}
          {!R.isNil(value.size) && value.size > 0
            ? ` · ${bytes(value.size * 1000)}`
            : ""}
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

function MultipleMedia({
  value,
  field,
  onChange,
}: {
  value?: MediaItem[];
  field: ModelField;
  onChange: (value: MediaItem[]) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-4 gap-2">
      {value?.map((item, idx) => (
        <div
          key={idx}
          className="aspect-square relative flex items-center shrink-0 group"
        >
          <Avatar className="size-full rounded-md">
            <AvatarImage
              src={item?.thumbnail}
              alt=""
              className="object-cover"
            />
            <AvatarFallback className="rounded-md" />
          </Avatar>
          {!field.readonly && (
            <button
              className="absolute bg-background/90 text-foreground rounded p-3 left-1/2 -translate-x-1/2 invisible group-hover:visible"
              onClick={(e) => {
                e.preventDefault();
                onChange?.(R.reject(R.whereEq({ id: item.id }), value ?? []));
              }}
            >
              <PiXBold />
            </button>
          )}
        </div>
      ))}

      <SelectDialog
        multiple={!!field.multiple}
        onSelect={(v) =>
          onChange?.([...(value ?? []), ...(Array.isArray(v) ? v : [v])])
        }
      >
        <button className="cursor-pointer aspect-square flex flex-col gap-1 items-center justify-center border border-dashed border-border hover:border-ring text-muted-foreground text-center text-sm font-medium rounded-md p-1">
          <PiImage className="size-6" />
          {t("widgets.media_widget.select_media")}
        </button>
      </SelectDialog>
    </div>
  );
}
