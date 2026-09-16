import { Outlet, useParams } from "react-router";

import { TenantInfo } from "@/components/tenant-info";

export function ModelListLayout() {
  const { model: label } = useParams<{ model: string }>();

  return (
    <div className="conte" key={label}>
      <TenantInfo label={label!} />
      <Outlet />
    </div>
  );
}
