import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { PageBody } from "@/components/ui/page-header";
import { useDiscover } from "@/hooks/use-discover";
import {
  type DashboardPageExtension,
  ExtensionType,
  type IFramePageExtension,
} from "@/types";

import { DashboardGrid } from "../(dashboard)/_components/dashboard-grid";

/** A path without its leading and trailing slashes. */
function trimSlashes(path: string) {
  return path.replace(/^\/+|\/+$/g, "");
}

export function CatchAllPage() {
  const { data: discover } = useDiscover();
  const { "*": path } = useParams();
  const { t } = useTranslation();
  const iframePage = discover?.extensions.find(
    (extension): extension is IFramePageExtension =>
      extension.extension_type === ExtensionType.IFramePage &&
      extension.config.path === `/${path}`,
  );
  // A dashboard page matches with or without its slashes, so "reports/"
  // serves /reports and /reports/.
  const dashboardPage = discover?.extensions.find(
    (extension): extension is DashboardPageExtension =>
      extension.extension_type === ExtensionType.DashboardPage &&
      trimSlashes(extension.config.path) === trimSlashes(path ?? ""),
  );

  if (dashboardPage) {
    return (
      <PageBody className="pt-10 pb-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            {dashboardPage.config.title}
          </h1>
          {dashboardPage.config.description ? (
            <div className="text-muted-foreground mt-1">
              {dashboardPage.config.description}
            </div>
          ) : null}
        </div>

        <DashboardGrid widgets={dashboardPage.config.widgets} />
      </PageBody>
    );
  }

  // The sandbox comes from the IFramePage (a default that keeps the page
  // from navigating the admin away; null turns it off). The referrer
  // policy keeps the admin's URLs from reaching another origin.
  return iframePage ? (
    <iframe
      src={iframePage.config.iframe_url}
      sandbox={iframePage.config.sandbox ?? undefined}
      referrerPolicy="strict-origin-when-cross-origin"
      className="flex-1"
    />
  ) : (
    <div className="flex-1 bg-background flex items-center justify-center">
      <span className="select-none">{t("app.not_found")}</span>
    </div>
  );
}
