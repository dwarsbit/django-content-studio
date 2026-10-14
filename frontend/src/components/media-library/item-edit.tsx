import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { CropField } from "@/components/media-library/crop-field";
import { FocusPointField } from "@/components/media-library/focus-point-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TagInput } from "@/components/ui/tag-input";
import { useCropMedia } from "@/hooks/use-crop-media";
import { useDiscover } from "@/hooks/use-discover";
import { useRetrieveMedia } from "@/hooks/use-retrieve-media";
import { useUpdateMedia } from "@/hooks/use-update-media";
import { getErrorMessage } from "@/lib/utils";
import type { CropValue, FocusPointValue, MediaItem } from "@/types";

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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[800px] p-0" showCloseButton={false}>
        <ItemEditContent itemId={itemId} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function ItemEditContent({
  itemId,
  onClose,
}: {
  itemId: string;
  onClose: VoidFunction;
}) {
  const { data } = useRetrieveMedia(itemId);

  return data ? (
    <EditForm data={data} onSave={onClose} />
  ) : (
    <div className="flex items-center justify-center h-full py-12 sm:py-24">
      <Spinner />
    </div>
  );
}

function EditForm({ data, onSave }: { data: MediaItem; onSave: VoidFunction }) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { mutateAsync } = useUpdateMedia();
  const { mutateAsync: cropMedia } = useCropMedia();

  const mediaLibrary = discover?.media_library;

  // Crop and focus point only apply to images.
  const isImage = data.type === "image";
  const cropEnabled = isImage && (mediaLibrary?.crop ?? false);
  const focusPointAttr = isImage ? (mediaLibrary?.focus_point ?? null) : null;
  const focusPointValue = focusPointAttr
    ? ((data as unknown as Record<string, FocusPointValue | null>)[
        focusPointAttr
      ] ?? null)
    : null;

  const [tab, setTab] = useState<"crop" | "focus">("crop");
  // A crop selection is not stored on the item: undefined means no crop
  // is sent. The focus point lives on the item's focus point attribute.
  const [crop, setCrop] = useState<CropValue | undefined>(undefined);
  const [focusPoint, setFocusPoint] = useState<FocusPointValue | null>(
    focusPointValue,
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
      // The focus point is a dynamic attribute on the item; merge the
      // editor's value into the payload under its configured name.
      const payload: MediaItem = focusPointAttr
        ? { ...values, [focusPointAttr]: focusPoint }
        : values;

      await mutateAsync(payload);

      // The crop is applied after the update: it goes through the
      // site's crop_image hook rather than the item's own fields. A
      // failed crop keeps the dialog open, so it can be retried.
      if (cropEnabled && crop) {
        try {
          await cropMedia({ id: data.id, crop });
        } catch (e: unknown) {
          toast.error(getErrorMessage(e));
          return;
        }
      }

      onSave();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <Form {...form}>
      <div className="flex">
        {isImage && (
          <div className="w-96 p-6 bg-muted rounded-l-lg flex items-center">
            {cropEnabled && focusPointAttr ? (
              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as "crop" | "focus")}
                className="w-full"
              >
                <TabsList className="mb-3">
                  <TabsTrigger value="crop">
                    {t("media_library.crop")}
                  </TabsTrigger>
                  <TabsTrigger value="focus">
                    {t("media_library.focus_point.title")}
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
                  <FocusPointField
                    value={focusPoint}
                    onChange={setFocusPoint}
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
            ) : focusPointAttr ? (
              <FocusPointField
                value={focusPoint}
                onChange={setFocusPoint}
                image={data.thumbnail}
              />
            ) : (
              <img
                alt={data.alt_text}
                src={data.thumbnail}
                className="w-full rounded"
              />
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col p-6">
          <div className="space-y-3 flex-1">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
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
                  <FormLabel>Alt text</FormLabel>
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
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <TagInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end items-center gap-3 mt-12">
            <DialogClose asChild>
              <Button variant="outline">{t("common.cancel")}</Button>
            </DialogClose>
            <Button onClick={(e) => form.handleSubmit(onSubmit)(e)}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </div>
    </Form>
  );
}
