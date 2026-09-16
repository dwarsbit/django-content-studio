import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { CropField } from "@/components/media-library/crop-field";
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
import { MultiSelect } from "@/components/ui/multi-select";
import { Spinner } from "@/components/ui/spinner";
import { useRetrieveMedia } from "@/hooks/use-retrieve-media";
import { useUpdateMedia } from "@/hooks/use-update-media";
import { getErrorMessage } from "@/lib/utils";
import type { MediaItem } from "@/types";

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
  const { mutateAsync } = useUpdateMedia();
  const formSchema = z.looseObject({
    id: z.string().readonly(),
  });
  const form = useForm<MediaItem>({
    resolver: zodResolver(formSchema),
    defaultValues: data,
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      await mutateAsync(values);
      onSave();
    } catch (e: any) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <Form {...form}>
      <div className="flex">
        <div className="w-96 p-6 bg-gray-200 rounded-l-lg flex items-center">
          <FormField
            control={form.control}
            name="crop"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <CropField
                    {...field}
                    image={data.thumbnail}
                    className="size-auto object-contain rounded-md"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
                    <MultiSelect creatable {...field} />
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
