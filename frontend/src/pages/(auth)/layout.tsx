import { Outlet } from "react-router";

export function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted">
      <Outlet />
    </div>
  );
}
