import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { App } from "@/app";
import { AuthGuard, AuthProvider } from "@/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { ForgotPasswordPage } from "@/pages/(auth)/forgot-password/page";
import { AuthLayout } from "@/pages/(auth)/layout";
import { LoginPage } from "@/pages/(auth)/login/page";
import { ResetPasswordPage } from "@/pages/(auth)/reset-password/page";
import { DashboardPage } from "@/pages/(studio)/(dashboard)/page";
import { CatchAllPage } from "@/pages/(studio)/[...slug]/page";
import { ModelListLayout } from "@/pages/(studio)/content/[model]/layout";
import { ModelListPage } from "@/pages/(studio)/content/[model]/page";
import { StudioLayout } from "@/pages/(studio)/layout";
import { MediaLibraryPage } from "@/pages/(studio)/media-library/[model]/page";
import { UIPage } from "@/pages/(studio)/ui/page";

const queryClient = new QueryClient();

// The UI showcase is a development tool: available under the vite dev server
// and on Django debug deployments (the template sets DCS_DEBUG); production
// installs never see the route.
const uiShowcaseEnabled = import.meta.env.DEV || window.DCS_DEBUG === true;

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        {
          element: <AuthGuard />,
          children: [
            {
              element: <StudioLayout />,
              children: [
                {
                  index: true,
                  element: <DashboardPage />,
                },
                {
                  path: "media-library",
                  element: <MediaLibraryPage />,
                },
                ...(uiShowcaseEnabled
                  ? [{ path: "ui", element: <UIPage /> }]
                  : []),
                {
                  path: "content/:model",
                  element: <ModelListLayout />,
                  children: [
                    {
                      index: true,
                      element: <ModelListPage />,
                    },
                  ],
                },
                {
                  path: "*",
                  element: <CatchAllPage />,
                },
              ],
            },
          ],
        },
        {
          element: <AuthLayout />,
          children: [
            {
              path: "login",
              element: <LoginPage />,
            },
            {
              path: "forgot-password",
              element: <ForgotPasswordPage />,
            },
            {
              path: "reset-password",
              element: <ResetPasswordPage />,
            },
          ],
        },
      ],
    },
  ],
  {
    basename: import.meta.env.PROD
      ? (window as typeof window & { DCS_BASENAME: string }).DCS_BASENAME
      : "",
  },
);

const root = document.getElementById("root")!;

ReactDOM.createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
