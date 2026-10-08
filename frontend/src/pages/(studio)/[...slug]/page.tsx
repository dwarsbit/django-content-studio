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

  return iframePage ? (
    <iframe src={iframePage.config.iframe_url} className="flex-1" />
  ) : (
    <div className="flex-1 bg-white flex items-center justify-center">
      <span className="select-none">{t("app.not_found")}</span>
    </div>
  );
}
