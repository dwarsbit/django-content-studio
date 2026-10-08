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

  return (
    <div className="group relative">
      {value ? (
        value.type === "image" ? (
          <Avatar className="w-full h-64 rounded-md">
            <AvatarImage
              src={value.thumbnail}
              alt=""
              className="object-cover"
            />
          </Avatar>
        ) : (
          <div className="w-full h-64 rounded-md bg-accent flex items-center justify-center">
            <PiFileBold size={24} />
          </div>
        )
      ) : (
        <img
          src={`${R.propOr("/", "DCS_STATIC_PREFIX", window)}img/media_placeholder.svg`}
          alt=""
          className="w-full h-64 object-cover rounded-md"
        />
      )}

      <div className="absolute invisible group-hover:visible top-0 bottom-0 left-0 right-0 bg-slate-900/40  rounded-md flex items-center justify-center">
        <div className="flex gap-2">
          <SelectDialog
            multiple={!!field.multiple}
            onSelect={(v) => onChange?.(Array.isArray(v) ? (v[0] ?? null) : v)}
          >
            <Button variant="outline">
              {t("widgets.media_widget.select_media")}
            </Button>
          </SelectDialog>
          {!field.required && !field.readonly && !R.isNil(value) && (
            <Button
              variant="outline"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                onChange?.(null);
              }}
            >
              <PiXBold className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
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
              className="absolute bg-white/50 rounded p-3 left-1/2 -translate-x-1/2 invisible group-hover:visible"
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
        <button className="cursor-pointer aspect-square flex flex-col gap-1 items-center justify-center border border-dashed border-stone-300 hover:border-stone-400 text-stone-400 text-center text-sm font-medium rounded-md p-1">
          <PiImage className="size-6" />
          {t("widgets.media_widget.select_media")}
        </button>
      </SelectDialog>
    </div>
  );
}
