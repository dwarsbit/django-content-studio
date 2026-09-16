import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiDotsThreeBold, PiXBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminInfo } from "@/hooks/use-admin-info";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import type { DateTimeString, Model, Resource } from "@/types";

export function Header({
  model,
  resource,
  isSaving,
  onSave,
  onDelete,
  onClose,
}: {
  model: Model;
  resource?: Resource;
  isSaving: boolean;
  onSave(): Promise<void>;
  onDelete?: VoidFunction;
  onClose?: VoidFunction;
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const { data: info } = useAdminInfo();
  const confirm = useConfirmDialog();
  const form = useFormContext();
  const isCreate = !resource?.id;
  const isSingleton = model?.admin.is_singleton ?? false;
  const { isDirty } = form.formState;
  const editedAt =
    resource && info
      ? (resource[info.settings.edited_at_attr] as DateTimeString)
      : null;
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    async mutationFn(id: string) {
      await http.delete(`/content/${model.label}/${id}`);
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["resources", model.label],
      });
    },
  });

  return (
    model && (
      <>
        <DialogHeader className="items-center border-b shadow-md shadow-gray-700/5 z-10">
          <div className="flex items-center gap-3 px-4 py-2 w-full">
            {model.admin.icon && (
              <div className="size-6 flex items-center justify-center bg-gray-200 rounded-md text-gray-500">
                <span className={cn(model.admin.icon, "text-[14px]")} />
              </div>
            )}
            <div className="select-none">
              <DialogTitle>
                {`${t(isCreate ? "editor.title_create" : "editor.title_edit", { modelName: model.verbose_name.toLowerCase() })}`}
              </DialogTitle>
              <div className="text-sm font-medium text-muted-foreground">
                {resource?.__str__}
              </div>
            </div>
            <div className="flex-1 flex items-center justify-end gap-2">
              {editedAt ? (
                <div className="text-muted-foreground text-sm font-medium mr-4 select-none">
                  {`${t("editor.last_edited")} ${dayjs(editedAt).fromNow()}`}
                </div>
              ) : null}
              <ButtonGroup>
                <Button
                  onClick={async () => {
                    try {
                      await onSave();
                    } catch (e) {}
                  }}
                  isLoading={isSaving}
                >
                  {t(isCreate ? "common.create" : "common.save")}
                </Button>
                {!isSingleton && !isCreate && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="outline">
                        <PiDotsThreeBold />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={async () => {
                          const confirmed = await confirm({
                            title: t("common.delete_confirm_title"),
                            description: t("common.delete_confirm_description"),
                          });
                          if (confirmed) {
                            await mutateAsync(resource!.id);
                            onDelete?.();
                          }
                        }}
                      >
                        {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </ButtonGroup>
              <Button
                size="icon"
                variant="ghost"
                disabled={isSaving}
                onClick={async () => {
                  if (!isDirty) {
                    return onClose?.();
                  }
                  const confirmed = await confirm({
                    description: t("editor.unsaved_alert"),
                  });

                  if (confirmed) {
                    onClose?.();
                  }
                }}
              >
                <PiXBold />
              </Button>
            </div>
          </div>
        </DialogHeader>
      </>
    )
  );
}
