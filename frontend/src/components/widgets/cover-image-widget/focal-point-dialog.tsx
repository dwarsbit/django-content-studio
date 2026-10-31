import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateMedia } from "@/hooks/use-update-media";
import { focalPointOf, focalPointUpdate } from "@/lib/media-metadata";
import { cn, getErrorMessage } from "@/lib/utils";
import type { FocalPointValue, MediaItem } from "@/types";

import { focalPointPosition } from "./focal-point-position";

// The crops previewed next to the image; the wide one spans the row.
const PREVIEWS = [
  { key: "wide", aspect: "aspect-[21/9]", className: "col-span-2" },
  { key: "card", aspect: "aspect-[4/3]", className: "" },
  { key: "square", aspect: "aspect-square", className: "" },
] as const;

const clamp = (n: number) => Math.min(Math.max(n, 0), 100);
const round = (n: number) => Number(n.toFixed(2));

/**
 * Sets a media item's focal point, with previews of how crops of the
 * image follow it. Saving updates the item itself, so the focal point
 * applies wherever the image is used.
 */
export function FocalPointDialog({
  item,
  attr,
  open,
  onOpenChange,
}: {
  item: MediaItem;
  // The media item attribute holding its properties, where the focal
  // point is stored (MEDIA_PROPERTIES_ATTR).
  attr: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[960px]">
        {open && (
          <FocalPointEditor
            item={item}
            attr={attr}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FocalPointEditor({
  item,
  attr,
  onDone,
}: {
  item: MediaItem;
  attr: string;
  onDone: VoidFunction;
}) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useUpdateMedia();
  const [point, setPoint] = useState<FocalPointValue | null>(
    focalPointOf(item, attr),
  );
  const position = focalPointPosition(point);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();

    setPoint({
      x: round(clamp(((e.clientX - rect.left) / rect.width) * 100)),
      y: round(clamp(((e.clientY - rect.top) / rect.height) * 100)),
    });
  };

  // Arrow keys move the point by 1%, with Shift by 10%.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key];

    if (!delta) {
      return;
    }

    e.preventDefault();
    const current = point ?? { x: 50, y: 50 };
    setPoint({
      x: round(clamp(current.x + delta[0])),
      y: round(clamp(current.y + delta[1])),
    });
  };

  const save = async () => {
    try {
      await mutateAsync({
        id: item.id,
        ...focalPointUpdate(item, attr, point),
      });
      onDone();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t("widgets.cover_image_widget.focal_point_dialog.title")}
        </DialogTitle>
        <DialogDescription>
          {t("widgets.cover_image_widget.focal_point_dialog.description")}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)] items-start">
        <div className="space-y-2">
          <div className="relative rounded-md overflow-hidden border bg-muted">
            <img
              alt=""
              src={item.thumbnail}
              draggable={false}
              className="block w-full select-none"
            />
            <button
              type="button"
              aria-label={
                point
                  ? t("widgets.cover_image_widget.focal_point_dialog.target", {
                      x: Math.round(point.x),
                      y: Math.round(point.y),
                    })
                  : t("widgets.cover_image_widget.focal_point_dialog.unset")
              }
              className="absolute inset-0 cursor-crosshair rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={handleClick}
              onKeyDown={handleKeyDown}
            />
            {point && (
              <span
                data-testid="focal-point-marker"
                className="pointer-events-none absolute size-4.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-3 border-white bg-black/25 shadow-sm ring-[1.5px] ring-black/55"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            )}
          </div>
          <div className="text-xs text-muted-foreground flex gap-2">
            <span className="truncate font-medium text-foreground">
              {item.name}
            </span>
            {point && (
              <span className="ml-auto tabular-nums shrink-0">
                x {Math.round(point.x)}% · y {Math.round(point.y)}%
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">
            {t("widgets.cover_image_widget.focal_point_dialog.previews")}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            {PREVIEWS.map((preview) => (
              <figure
                key={preview.key}
                className={cn("space-y-1", preview.className)}
              >
                <img
                  alt=""
                  src={item.thumbnail}
                  draggable={false}
                  className={cn(
                    "w-full rounded-sm border object-cover",
                    preview.aspect,
                  )}
                  style={{ objectPosition: position }}
                />
                <figcaption className="text-xs text-muted-foreground">
                  {t(
                    `widgets.cover_image_widget.focal_point_dialog.${preview.key}`,
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter className="sm:items-center">
        <Button
          type="button"
          variant="ghost"
          className="sm:mr-auto"
          disabled={!point}
          onClick={() => setPoint(null)}
        >
          {t("widgets.cover_image_widget.focal_point_dialog.reset")}
        </Button>
        <span className="text-xs text-muted-foreground sm:text-right">
          {t("widgets.cover_image_widget.shared_hint")}
        </span>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("common.cancel")}
          </Button>
        </DialogClose>
        <Button type="button" disabled={isPending} onClick={save}>
          {t("widgets.cover_image_widget.focal_point_dialog.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
