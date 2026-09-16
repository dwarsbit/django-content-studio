import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiPlus, PiXBold } from "react-icons/pi";
import { useKeyPressEvent } from "react-use";
import { toast } from "sonner";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useCreateFolder } from "@/hooks/use-create-folder";
import { useDiscover } from "@/hooks/use-discover";
import { getErrorMessage } from "@/lib/utils";

export function CreateFolderButton({ parent }: { parent: string | null }) {
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
    } catch (e: any) {
      toast.error(getErrorMessage(e));
    }
  }, [mutateAsync, name, parent]);

  return modelLabel ? (
    create ? (
      <InputGroup>
        <InputGroupInput
          value={name}
          disabled={isPending}
          autoFocus
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
      <button
        onClick={() => setCreate(true)}
        className="flex items-center gap-2 text-muted-foreground hover:text-secondary-foreground"
      >
        <PiPlus className="mr-1" />
        <span>{t("media_library.new_folder")}</span>
      </button>
    )
  ) : null;
}
