import { Outlet } from "react-router";

import { TenantProvider } from "@/tenant";

import { MainMenu } from "./_components/main-menu";

export function StudioLayout() {
  return (
    <TenantProvider>
      <div className="h-screen flex items-stretch">
        <MainMenu />
        <div className="flex-1 overflow-hidden bg-muted flex flex-col">
          <div className="flex-1 bg-card border rounded-l-xl flex flex-col overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </TenantProvider>
  );
}
