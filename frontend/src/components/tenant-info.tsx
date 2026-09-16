import * as R from "ramda";
import { useTranslation } from "react-i18next";

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
      <div className="bg-amber-100 text-amber-500 py-1 px-4 text-sm font-medium text-center select-none">
        {t("tenant.shared_message", {
          content_type: model.verbose_name_plural,
          tenant: tenantModel.verbose_name_plural,
        })}
      </div>
    )
  );
}
