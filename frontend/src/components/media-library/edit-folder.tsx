import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiXBold } from "react-icons/pi";
import { useKeyPressEvent } from "react-use";
import { toast } from "sonner";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useUpdateFolder } from "@/hooks/use-update-folder";
import { getErrorMessage } from "@/lib/utils";

export function EditFolder({
  folder,
  onClose,
}: {
  folder: { id: string; name: string };
  onClose: VoidFunction;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(folder.name);
  const { mutateAsync, isPending } = useUpdateFolder();

  useKeyPressEvent("Escape", () => {
    onClose();
  });

  const handleSubmit = useCallback(async () => {
    if (!name) return;

    try {
      await mutateAsync({ id: folder.id, name });
      onClose();
    } catch (e: any) {
      toast.error(getErrorMessage(e));
    }
  }, [folder.id, mutateAsync, name, onClose]);

  return (
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
          {t("common.save")}
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" disabled={isPending} onClick={onClose}>
          <PiXBold size={12} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
