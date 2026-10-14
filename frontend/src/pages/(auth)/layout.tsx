import { Outlet } from "react-router";

export function AuthLayout() {
  return (
    <div className="relative flex flex-col items-center">
      <div className="z-20 min-h-screen w-full flex flex-col items-center">
        <Outlet />
      </div>
      <div className="bg-linear-to-b from-gray-900 via-gray-900/80 to-gray-900/0 size-full absolute top-0 bottom-0 left-0 right-0 z-10 pointer-events-none" />
      <div
        className="bg-repeat size-full absolute top-0 bottom-0 left-0 right-0 z-0 pointer-events-none"
        style={{
          backgroundImage: `url(${(window as any).DCS_STATIC_PREFIX}img/bg-dots.svg)`,
        }}
      />
    </div>
  );
}
