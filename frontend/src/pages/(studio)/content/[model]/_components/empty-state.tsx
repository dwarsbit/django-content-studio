import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import type { Model } from "@/types";

/**
 * The shared empty state of the table and list views. A truly empty
 * list invites creation; while search or filters are active the list
 * shows a no-results notice that offers clearing them.
 */
export function EmptyState({
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
    <div className="text-center py-12 space-y-3">
      {filtered ? (
        <>
          <div className="font-normal text-muted-foreground">
            {t("list_view.no_results")}
          </div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("list_view.clear_all_filters")}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="font-normal text-muted-foreground">
            {t("list_view.empty_state")}
          </div>
          {model.admin.permissions.add_permission && (
            <Link
              to={`/content/${model.label}/new`}
              className={buttonVariants()}
            >
              {t("common.create")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
