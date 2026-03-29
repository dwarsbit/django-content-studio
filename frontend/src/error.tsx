import axios from "axios";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useHttp } from "@/hooks/use-http";

import packageJson from "../package.json";

export function Error({ error }: { error: Error }) {
  const { t } = useTranslation();
  const http = useHttp();

  const isNetworkError = axios.isAxiosError(error) && !error.response;

  return (
    <div className="min-h-screen bg-accent flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col gap-3 items-center animate-in fade-in-0 slide-in-from-bottom-20 duration-500">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>{t("app.error")}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
        {isNetworkError && (
          <div className="flex flex-col gap-1 py-2 text-muted-foreground">
            <div className="font-semibold">
              ☝️ {t("app.error_troubleshooting")}
            </div>
            <ul className="list-disc list-inside">
              <li>{t("app.error_troubleshooting_django")}</li>
              <li>
                {`${t("app.error_troubleshooting_api")}: `}
                <span className="font-mono text-xs">
                  {http.defaults.baseURL}
                </span>
              </li>
            </ul>
          </div>
        )}
        <div className="text-muted-foreground text-sm text-center cursor-default">
          {`Django Content Studio v${packageJson.version}`}
        </div>
      </div>
    </div>
  );
}
