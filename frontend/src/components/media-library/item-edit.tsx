import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  PiCropBold,
  PiCrosshairBold,
  PiDownloadSimpleBold,
  PiLinkBold,
  PiTrashBold,
  PiXBold,
} from "react-icons/pi";
import { useCopyToClipboard } from "react-use";
import { toast } from "sonner";
import { z } from "zod";

import { CropField } from "@/components/media-library/crop-field";
import { describeFile, FileIcon } from "@/components/media-library/file-meta";
import { FocalPointField } from "@/components/media-library/focus-point-field";
import { FolderPicker } from "@/components/media-library/folder-picker";
import { useDeleteItem } from "@/components/media-library/item-card";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagInput } from "@/components/ui/tag-input";
import { useCropMedia } from "@/hooks/use-crop-media";
import { useDiscover } from "@/hooks/use-discover";
import { useRetrieveMedia } from "@/hooks/use-retrieve-media";
import { useUpdateMedia } from "@/hooks/use-update-media";
import { getErrorMessage } from "@/lib/utils";
import type { CropValue, FocalPointValue, MediaItem } from "@/types";

/**
 * A file's details, in a sheet from the right: the preview, the quick
 * actions, the editable name, alt text and tags, and Delete in the
 * footer. Crop and focal point open in their own dialog from the
 * sheet; their changes are applied when the file is saved.
 */
export function ItemEdit({
  itemId,
  open,
  onClose,
}: {
  itemId: string;
  open: boolean;
  onClose: VoidFunction;
}) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[400px] sm:max-w-[400px] gap-0 p-0">
        <ItemEditContent itemId={itemId} onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}

function ItemEditContent({
  itemId,
  onClose,
}: {
  itemId: string;
  onClose: VoidFunction;
}) {
  const { t } = useTranslation();
  const { data } = useRetrieveMedia(itemId);

  return data ? (
    <EditForm data={data} onClose={onClose} />
  ) : (
    <>
      <SheetHeader className="sr-only">
        <SheetTitle>{t("media_library.title")}</SheetTitle>
      </SheetHeader>
      <div className="flex items-center justify-center h-full py-12 sm:py-24">
        <Spinner />
      </div>
    </>
  );
}

type ImageTab = "crop" | "focus";

function EditForm({
  data,
  onClose,
}: {
  data: MediaItem;
  onClose: VoidFunction;
}) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { mutateAsync } = useUpdateMedia();
  const { mutateAsync: cropMedia } = useCropMedia();
  const { remove, isPending: isDeleting } = useDeleteItem();
  const [, copy] = useCopyToClipboard();

  const mediaLibrary = discover?.media_library;
  const hasFolders = mediaLibrary?.folders ?? false;

  // Crop and focal point only apply to images.
  const isImage = data.type === "image";
  const cropEnabled = isImage && (mediaLibrary?.crop ?? false);
  const focalPointAttr = isImage ? (mediaLibrary?.focal_point ?? null) : null;
  const focalPointValue = focalPointAttr
    ? ((data as unknown as Record<string, FocalPointValue | null>)[
        focalPointAttr
      ] ?? null)
    : null;

  // The image dialog, opened on the crop or the focal point tab.
  const [imageTab, setImageTab] = useState<ImageTab | null>(null);
  // A crop selection is not stored on the item: undefined means no crop
  // is sent. The focal point lives on the item's focal point attribute.
  const [crop, setCrop] = useState<CropValue | undefined>(undefined);
  const [focalPoint, setFocalPoint] = useState<FocalPointValue | null>(
    focalPointValue,
  );

  const formSchema = z.looseObject({
    id: z.string().readonly(),
  });
  const form = useForm<MediaItem>({
    // The schema only pins down required fields; the values themselves are a
    // full media item, so the resolver is widened to the form's value type.
    resolver: zodResolver(formSchema) as unknown as Resolver<MediaItem>,
    // The API serializes integer primary keys as JSON numbers; the
    // form schema (and the rest of the app) treats ids as strings.
    // Without the cast, the resolver rejects the id and saving does
    // nothing — silently, because the id has no rendered field.
    defaultValues: {
      ...data,
      id: data.id != null ? String(data.id) : data.id,
    },
  });

  const onSubmit = async (values: MediaItem) => {
    try {
      // The focal point is a dynamic attribute on the item; merge the
      // editor's value into the payload under its configured name.
      const payload: MediaItem = focalPointAttr
        ? { ...values, [focalPointAttr]: focalPoint }
        : values;

      await mutateAsync(payload);

      // The crop is applied after the update: it goes through the
      // site's crop_image hook rather than the item's own fields. A
      // failed crop keeps the sheet open, so it can be retried.
      if (cropEnabled && crop) {
        try {
          await cropMedia({ id: data.id, crop });
        } catch (e: unknown) {
          toast.error(getErrorMessage(e));
          return;
        }
      }

      onClose();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  const typeLabel = t(`media_library.file_types.${data.type}`);

  return (
    <Form {...form}>
      <SheetHeader className="border-b pr-12 relative">
        <SheetTitle className="truncate">{data.name}</SheetTitle>
        <SheetDescription>{describeFile(data, typeLabel)}</SheetDescription>
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("common.close")}
            className="absolute top-3.5 right-3 text-muted-foreground"
          >
            <PiXBold />
          </Button>
        </SheetClose>
      </SheetHeader>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar">
        <div className="aspect-[4/3] bg-muted border-b flex items-center justify-center">
          {isImage ? (
            <img
              alt={data.alt_text}
              src={data.thumbnail}
              className="size-full object-contain"
            />
          ) : (
            <FileIcon item={data} className="size-10 text-muted-foreground" />
          )}
        </div>

        <div className="p-4 flex items-center gap-2 flex-wrap border-b">
          {cropEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImageTab("crop")}
            >
              <PiCropBold />
              {t("media_library.crop")}
            </Button>
          )}
          {focalPointAttr && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImageTab("focus")}
            >
              <PiCrosshairBold />
              {t("media_library.focal_point.title")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              copy(data.file);
              toast.success(t("common.copied_to_clipboard"));
            }}
          >
            <PiLinkBold />
            {t("media_library.copy_url")}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={data.file} download>
              <PiDownloadSimpleBold />
              {t("common.download")}
            </a>
          </Button>
          {hasFolders && (
            <FolderPicker
              label={t("common.move")}
              onSelect={async (folder) => {
                try {
                  await mutateAsync({ ...data, folder });
                  toast.success(t("media_library.moved"));
                } catch (e: unknown) {
                  toast.error(getErrorMessage(e));
                }
              }}
            />
          )}
        </div>

        <div className="p-4 space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("media_library.fields.name")}</FormLabel>
                <FormControl>
                  <Input
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="alt_text"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("media_library.fields.alt_text")}</FormLabel>
                <FormControl>
                  <Input
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                {isImage && (
                  <FormDescription>
                    {t("media_library.fields.alt_text_hint")}
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("media_library.fields.tags")}</FormLabel>
                <FormControl>
                  <TagInput {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <SheetFooter className="border-t flex-row items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={isDeleting}
          className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={async () => {
            if (await remove(data)) {
              onClose();
            }
          }}
        >
          <PiTrashBold />
          {t("common.delete")}
        </Button>
        <SheetClose asChild>
          <Button variant="outline">{t("common.cancel")}</Button>
        </SheetClose>
        <Button onClick={(e) => form.handleSubmit(onSubmit)(e)}>
          {t("common.save")}
        </Button>
      </SheetFooter>

      <Dialog
        open={imageTab !== null}
        onOpenChange={(isOpen) => !isOpen && setImageTab(null)}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {imageTab === "focus"
                ? t("media_library.focal_point.title")
                : t("media_library.crop")}
            </DialogTitle>
            <DialogDescription>
              {t("media_library.image_dialog_hint")}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-4 flex items-center justify-center">
            {cropEnabled && focalPointAttr ? (
              <Tabs
                value={imageTab ?? "crop"}
                onValueChange={(value) => setImageTab(value as ImageTab)}
                className="w-full"
              >
                <TabsList className="mb-3">
                  <TabsTrigger value="crop">
                    {t("media_library.crop")}
                  </TabsTrigger>
                  <TabsTrigger value="focus">
                    {t("media_library.focal_point.title")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="crop">
                  <CropField
                    value={crop}
                    onChange={setCrop}
                    image={data.thumbnail}
                    className="size-auto object-contain rounded-md"
                  />
                </TabsContent>
                <TabsContent value="focus">
                  <FocalPointField
                    value={focalPoint}
                    onChange={setFocalPoint}
                    image={data.thumbnail}
                  />
                </TabsContent>
              </Tabs>
            ) : cropEnabled ? (
              <CropField
                value={crop}
                onChange={setCrop}
                image={data.thumbnail}
                className="w-full"
              />
            ) : focalPointAttr ? (
              <FocalPointField
                value={focalPoint}
                onChange={setFocalPoint}
                image={data.thumbnail}
              />
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button>{t("common.done")}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
