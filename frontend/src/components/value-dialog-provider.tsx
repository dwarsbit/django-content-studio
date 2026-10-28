import React, { useCallback, useState } from "react";

import { ButtonValueDialog } from "@/components/buttons/button-value-dialog";
import { ValueDialogContext } from "@/lib/value-dialog-context";

export function ValueDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [value, setValue] = useState<string | null>(null);
  const showValue = useCallback((next: string) => setValue(next), []);

  return (
    <ValueDialogContext.Provider value={{ showValue }}>
      {children}
      <ButtonValueDialog value={value} onClose={() => setValue(null)} />
    </ValueDialogContext.Provider>
  );
}
