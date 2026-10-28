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
import { PageHeader } from "@/components/ui/page-header";
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
        <DialogHeader className="z-10 block">
          <PageHeader
            heading={dialog ? "div" : "h1"}
            back={
              !isSingleton && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="-ml-2 text-muted-foreground"
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
              )
            }
            icon={model.admin.icon && <span className={model.admin.icon} />}
            title={
              <span className="flex items-center gap-1.5 min-w-0">
                {dialog ? (
                  <DialogTitle
                    className={cn(
                      "text-base leading-normal font-medium shrink-0 first-letter:uppercase",
                      resource ? "text-muted-foreground" : "font-semibold",
                    )}
                  >
                    {model.verbose_name_plural}
                  </DialogTitle>
                ) : (
                  <span
                    className={cn(
                      "shrink-0 first-letter:uppercase",
                      resource && "text-muted-foreground font-medium",
                    )}
                  >
                    {model.verbose_name_plural}
                  </span>
                )}
                {resource && (
                  <>
                    <span className="text-muted-foreground/50 shrink-0">/</span>
                    <span className="truncate">{resource.__str__}</span>
                  </>
                )}
              </span>
            }
            actions={
              <>
                {isDirty && !readOnly ? (
                  <div className="hidden lg:flex items-center gap-1.5 text-muted-foreground text-sm mr-2 select-none">
                    <span className="size-1.5 rounded-full bg-warning" />
                    {t("editor.unsaved_changes")}
                  </div>
                ) : editedAt ? (
                  <div className="hidden lg:block text-muted-foreground text-sm mr-2 select-none">
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
                    className="min-w-20"
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
                      isCreate && !isSingleton
                        ? "common.create"
                        : "common.save",
                    )}
                  </Button>
                )}
              </>
            }
          />
        </DialogHeader>
      </>
    )
  );
}
