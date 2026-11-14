import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiArrowLeftBold, PiDotsThreeBold } from "react-icons/pi";
import { toast } from "sonner";

import {
  FollowButton,
  FollowMenuItem,
} from "@/components/notifications/follow-button";
import { PresenceAvatars } from "@/components/presence";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { useAdminInfo } from "@/hooks/use-admin-info";
import useConfirmDialog from "@/hooks/use-confirm-dialog";
import { useHttp } from "@/hooks/use-http";
import { cn, getErrorMessage } from "@/lib/utils";
import type {
  DateTimeString,
  FormField,
  Model,
  PresenceUser,
  Resource,
} from "@/types";

import { Conditional } from "./conditional";
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
  presence = [],
  onDuplicate,
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
  // The other users who have the object open.
  presence?: PresenceUser[];
  // Offers Duplicate in the more actions menu.
  onDuplicate?: VoidFunction;
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
  // Follow, with the notifications app; not in dialogs (inline rows and
  // related objects are followed through their own pages).
  const canFollow =
    !!model?.admin.notifications && !dialog && !isCreate && !!resource;
  const showDuplicate = !isSingleton && !!onDuplicate;
  const showDelete = !isSingleton && canDelete;
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
                <PresenceAvatars users={presence} />
                {canFollow && (
                  <FollowButton
                    model={model}
                    id={resource.id}
                    name={resource.__str__}
                    className="hidden lg:inline-flex"
                  />
                )}
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
                  <Conditional
                    key={component.component_id}
                    when={component.when}
                  >
                    <ComponentRenderer formField={component} model={model} />
                  </Conditional>
                ))}
                {!isCreate && (showDelete || showDuplicate || canFollow) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t("editor.more_actions")}
                        // Only Follow inside: the header shows it wide.
                        className={cn(
                          !showDelete && !showDuplicate && "lg:hidden",
                        )}
                      >
                        <PiDotsThreeBold />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canFollow && (
                        <FollowMenuItem
                          model={model}
                          id={resource.id}
                          name={resource.__str__}
                          className="lg:hidden"
                        />
                      )}
                      {showDuplicate && (
                        <DropdownMenuItem onSelect={onDuplicate!}>
                          {t("editor.duplicate")}
                        </DropdownMenuItem>
                      )}
                      {showDuplicate && showDelete && <DropdownMenuSeparator />}
                      {showDelete && (
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

                            if (!confirmed) {
                              return;
                            }

                            // A refused delete (objects that refer to it,
                            // or the studio's delete_model) keeps the page
                            // open and says why.
                            try {
                              await mutateAsync(resource!.id);
                            } catch (e: unknown) {
                              toast.error(getErrorMessage(e));
                              return;
                            }

                            onDelete?.();
                          }}
                        >
                          {t("common.delete")}
                        </DropdownMenuItem>
                      )}
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
