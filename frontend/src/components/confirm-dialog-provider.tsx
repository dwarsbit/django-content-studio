import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useEscape } from "@/hooks/use-escape";
import { ConfirmDialogContext } from "@/lib/confirm-dialog-context";

export function ConfirmDialogProvider({ children }: Props) {
  const [dialog, setDialog] = useState<ConfirmDialogProps | null>(null);

  // Stable, so hooks depending on setDialog (useConfirmDialog consumers)
  // do not re-run on every render.
  const openDialog = useCallback((value: ConfirmDialogProps) => {
    setDialog(value);
  }, []);

  return (
    <ConfirmDialogContext.Provider
      value={{
        setDialog: openDialog,
      }}
    >
      <AlertDialog
        open={!!dialog}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
      >
        <ConfirmDialog
          title={dialog?.title ?? ""}
          description={dialog?.description ?? ""}
          onOk={() => {
            setDialog(null);
            dialog?.onOk?.();
          }}
          onCancel={() => {
            setDialog(null);
            dialog?.onCancel?.();
          }}
        />
      </AlertDialog>

      {children}
    </ConfirmDialogContext.Provider>
  );
}

function ConfirmDialog({
  title,
  description,
  okText,
  cancelText,
  onCancel,
  onOk,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  useEscape(() => onCancel?.());

  return (
    <AlertDialogContent className="p-6">
      <AlertDialogHeader>
        {title && <AlertDialogTitle>{title}</AlertDialogTitle>}
      </AlertDialogHeader>
      <AlertDialogDescription>{description}</AlertDialogDescription>
      <AlertDialogFooter>
        <Button onClick={() => onCancel?.()} variant="link">
          {cancelText || t("common.cancel")}
        </Button>
        <Button onClick={() => onOk?.()}>
          {okText || t("common.continue")}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

export interface ConfirmDialogProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  okText?: React.ReactNode;
  cancelText?: React.ReactNode;
  onCancel?(): void;
  onOk?(): void;
}

interface Props {
  children: React.ReactNode;
}
