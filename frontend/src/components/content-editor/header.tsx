import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiArrowLeftBold, PiDotsThreeBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
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
import type { DateTimeString, FormField, Model, Resource } from "@/types";

import { ComponentRenderer } from "./form-field";

export function Header({
  model,
  resource,
  resourcePath,
  isSaving,
  dialog = false,
  components = model?.admin.edit.header ?? [],
  readOnly = false,
  canDelete = true,
  onSave,
  onDelete,
  onClose,
}: {
  model: Model;
  resource?: Resource;
  resourcePath: string;
  isSaving: boolean;
  // The edit_header components; defaults to the model's studio
  // (inline rows pass their inline's).
  components?: FormField[];
  // Read-only editors have no save button.
  readOnly?: boolean;
  canDelete?: boolean;
  // Whether the editor renders inside a Dialog: the title then is a
  // DialogTitle and the close button confirms unsaved changes itself;
  // routed editors rely on the navigation guard instead.
  dialog?: boolean;
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
      await http.delete(`${resourcePath}/${id}`);
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
        <DialogHeader className="items-center z-10">
          <div className="flex items-center gap-3 px-4 pb-3 pt-6 w-full">
            {model.admin.icon && (
              <div className="size-6 flex items-center justify-center bg-muted rounded-md text-muted-foreground">
                <span className={cn(model.admin.icon, "text-base")} />
              </div>
            )}
            <div className="select-none flex items-center gap-1.5">
              {!isSingleton && (
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={isSaving}
                  aria-label={t("editor.back_to_list")}
                  onClick={async () => {
                    if (dialog) {
                      if (!isDirty) {
                        return onClose?.();
                      }

                      const confirmed = await confirm({
                        description: t("editor.unsaved_alert"),
                      });

                      if (confirmed) {
                        onClose?.();
                      }

                      return;
                    }

                    onClose?.();
                  }}
                >
                  <PiArrowLeftBold />
                </Button>
              )}
              {dialog ? (
                <DialogTitle>{model.verbose_name_plural}</DialogTitle>
              ) : (
                <h2 className="text-sm leading-none font-semibold">
                  {model.verbose_name_plural}
                </h2>
              )}
              {resource && <div>{"/"}</div>}
              <div className="text-sm font-medium text-accent-foreground">
                {resource?.__str__}
              </div>
            </div>
            <div className="flex-1 flex items-center justify-end gap-2">
              {editedAt ? (
                <div className="text-muted-foreground text-sm font-medium mr-4 select-none">
                  {`${t("editor.last_edited")} ${dayjs(editedAt).fromNow()}`}
                </div>
              ) : null}

              {components.map((component) => (
                <ComponentRenderer
                  key={component.component_id}
                  formField={component}
                  model={model}
                />
              ))}

              {!isSingleton && !isCreate && canDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-full"
                      aria-label={t("editor.more_actions")}
                    >
                      <PiDotsThreeBold />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={async () => {
                        const confirmed = await confirm({
                          title: t("common.delete_confirm_title"),
                          // With soft delete the object lands in the
                          // trash and can be restored, which the
                          // regular message denies.
                          description: t(
                            model.admin.list.trash
                              ? "common.delete_to_trash_confirm_description"
                              : "common.delete_confirm_description",
                          ),
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

              {!readOnly && (
                <Button
                  className="rounded-full px-6"
                  onClick={async () => {
                    try {
                      await onSave();
                    } catch {
                      // Errors are already surfaced by the save flow.
                    }
                  }}
                  isLoading={isSaving}
                >
                  {t(
                    isCreate && !isSingleton ? "common.create" : "common.save",
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
      </>
    )
  );
}
