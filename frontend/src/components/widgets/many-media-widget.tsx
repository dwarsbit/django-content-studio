import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { PiImage, PiXBold } from "react-icons/pi";

import { SelectDialog } from "@/components/media-library/select-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { MediaItem, ModelField, WidgetProps } from "@/types";

export function ManyMediaWidget({
  value,
  field,
  onChange,
}: {
  field: ModelField;
} & WidgetProps<MediaItem[]>) {
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
                onChange?.(R.reject(R.whereEq({ id: item.id }), value));
              }}
            >
              <PiXBold />
            </button>
          )}
        </div>
      ))}

      <SelectDialog
        multiple
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
