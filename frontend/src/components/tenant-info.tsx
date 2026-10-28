import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { PiInfoBold } from "react-icons/pi";

import { useDiscover } from "@/hooks/use-discover";
import { useTenant } from "@/tenant";

export function TenantInfo({ label }: { label: string }) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { enabled } = useTenant();
  const model = discover?.models.find(R.whereEq({ label }));
  const tenantModel = discover?.models.find(
    R.whereEq({ label: discover?.multitenancy.tenant_model }),
  );
  const isShared =
    enabled && model && tenantModel && R.isNil(model.tenant_field);

  return (
    isShared &&
    label !== tenantModel.label && (
      <div className="shrink-0 bg-muted border-b px-6 py-2 text-sm text-muted-foreground flex items-center gap-2 select-none">
        <PiInfoBold className="size-4 shrink-0" />
        {t("tenant.shared_message", {
          content_type: model.verbose_name_plural,
          tenant: tenantModel.verbose_name_plural,
        })}
      </div>
    )
  );
}
