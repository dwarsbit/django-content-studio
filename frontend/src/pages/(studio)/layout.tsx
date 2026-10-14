import { useEffect, useState } from "react";
import { Outlet } from "react-router";

import { CommandPalette } from "@/components/command-palette";
import { TenantProvider } from "@/tenant";

import { MainMenu } from "./_components/main-menu";

export function StudioLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K on macOS, Ctrl+K elsewhere, toggles the command palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <TenantProvider>
      <>
        <div className="h-screen flex items-stretch">
          <MainMenu onOpenPalette={() => setPaletteOpen(true)} />
          <div className="flex-1 overflow-hidden bg-background flex flex-col">
            <Outlet />
          </div>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </>
    </TenantProvider>
  );
}
