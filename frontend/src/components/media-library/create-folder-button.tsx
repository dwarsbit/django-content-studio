import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiFolderPlusBold, PiXBold } from "react-icons/pi";
import { useKeyPressEvent } from "react-use";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useCreateFolder } from "@/hooks/use-create-folder";
import { useDiscover } from "@/hooks/use-discover";
import { getErrorMessage } from "@/lib/utils";

/**
 * "New folder" at the foot of the folder tree: a ghost button that
 * turns into an input group (name, Create, cancel) creating a folder
 * inside `parent`.
 */
export function CreateFolderButton({
  parent,
  className,
}: {
  parent: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const { data: discover } = useDiscover();
  const modelLabel = discover?.media_library.models.folder_model;
  const { mutateAsync, isPending } = useCreateFolder();

  useKeyPressEvent("Escape", () => {
    setCreate(false);
    setName("");
  });

  const handleSubmit = useCallback(async () => {
    if (!name) return;

    try {
      await mutateAsync({ name, parent });
      setCreate(false);
      setName("");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  }, [mutateAsync, name, parent]);

  return modelLabel ? (
    create ? (
      <InputGroup className={className}>
        <InputGroupInput
          value={name}
          disabled={isPending}
          autoFocus
          placeholder={t("media_library.new_folder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            disabled={name.length === 0}
            isLoading={isPending}
            variant="default"
            onClick={handleSubmit}
          >
            {t("common.create")}
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            disabled={isPending}
            aria-label={t("common.cancel")}
            onClick={() => {
              setCreate(false);
              setName("");
            }}
          >
            <PiXBold size={12} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    ) : (
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setCreate(true)}
      >
        <PiFolderPlusBold />
        {t("media_library.new_folder")}
      </Button>
    )
  ) : null;
}
