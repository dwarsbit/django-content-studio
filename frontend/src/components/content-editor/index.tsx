import { useLocation, useNavigate } from "react-router";

import { Dialog, DialogContent } from "@/components/ui/dialog";

import { Editor } from "./editor";

export function ContentEditor() {
  const location = useLocation();
  const navigate = useNavigate();
  const [, modelLabel, id] = location.hash.split(":");

  return (
    <Dialog
      open={location.hash.startsWith("#editor:")}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          navigate({ hash: "" });
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-none max-h-none w-auto rounded-l-xl rounded-r-none left-[54px] top-0 right-0 bottom-0 translate-0 p-0 overflow-hidden flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Editor
          modelLabel={modelLabel}
          id={id}
          onClose={() => navigate({ hash: "" })}
          onSave={() => navigate({ hash: "" })}
          onDelete={() => navigate({ hash: "" })}
        />
      </DialogContent>
    </Dialog>
  );
}
