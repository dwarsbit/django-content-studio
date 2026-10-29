import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { useDiscover } from "@/hooks/use-discover";
import { ExtensionType, type IFramePageExtension } from "@/types";

export function CatchAllPage() {
  const { data: discover } = useDiscover();
  const { "*": path } = useParams();
  const { t } = useTranslation();
  const iframePage = discover?.extensions.find(
    (extension): extension is IFramePageExtension =>
      extension.extension_type === ExtensionType.IFramePage &&
      extension.config.path === `/${path}`,
  );

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
