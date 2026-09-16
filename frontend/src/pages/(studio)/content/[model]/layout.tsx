import { Outlet, useParams } from "react-router";

import { TenantInfo } from "@/components/tenant-info";

export function ModelListLayout() {
  const { model: label } = useParams<{ model: string }>();

  return (
    <div className="flex flex-col flex-1 overflow-hidden" key={label}>
      <TenantInfo label={label!} />
      <Outlet />
    </div>
  );
}
