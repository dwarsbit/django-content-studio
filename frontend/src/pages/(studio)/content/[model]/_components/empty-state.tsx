import { useTranslation } from "react-i18next";
import { PiFileTextBold, PiFunnelBold } from "react-icons/pi";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Model } from "@/types";

/**
 * The shared empty state of the table and list views. A truly empty
 * list invites creation; while search or filters are active the list
 * shows a no-results notice that offers clearing them.
 */
export function ListEmptyState({
  model,
  filtered,
  onClear,
}: {
  model: Model;
  // Whether a search term or remembered filters narrow the list.
  filtered: boolean;
  // Clears the search term and the remembered filters.
  onClear?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={
        filtered ? (
          <PiFunnelBold />
        ) : model.admin.icon ? (
          <span className={model.admin.icon} />
        ) : (
          <PiFileTextBold />
        )
      }
      description={
        filtered ? t("list_view.no_results") : t("list_view.empty_state")
      }
      action={
        filtered
          ? onClear && (
              <Button variant="outline" onClick={onClear}>
                {t("list_view.clear_all_filters")}
              </Button>
            )
          : model.admin.permissions.add_permission && (
              <Button asChild>
                <Link to={`/content/${model.label}/new`}>
                  {t("common.create")}
                </Link>
              </Button>
            )
      }
    />
  );
}
