import { Outlet } from "react-router";

import { TenantProvider } from "@/tenant";

import { MainMenu } from "./_components/main-menu";

export function StudioLayout() {
  return (
    <TenantProvider>
      <div className="h-screen flex items-stretch">
        <MainMenu />
        <div className="flex-1 overflow-hidden bg-background border-l flex flex-col">
          <Outlet />
        </div>
      </div>
    </TenantProvider>
  );
}
