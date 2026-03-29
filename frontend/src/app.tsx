import "./index.css";
import "./i18n";
// Dayjs locales
import "dayjs/locale/en";
import "dayjs/locale/nl";
import "dayjs/locale/fr";
import "dayjs/locale/de";

import dayjs from "dayjs";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";
import { LoadingBar } from "@/components/loading-bar";
import { Toaster } from "@/components/ui/sonner";
import { Error } from "@/error";
import { useAdminInfo } from "@/hooks/use-admin-info";

export function App() {
  const { t, i18n } = useTranslation();
  const { isError, error } = useAdminInfo();

  useEffect(() => {
    dayjs.locale(i18n.language);
  }, [i18n.language]);

  return (
    <>
      <LoadingBar />
      <ConfirmDialogProvider>
        {isError ? <Error error={error} /> : <Outlet />}
      </ConfirmDialogProvider>
      <Toaster />
    </>
  );
}
