import { useTranslation } from "react-i18next";
import { PiFileTextBold, PiFunnelBold } from "react-icons/pi";
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
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 font-normal whitespace-normal">
      <div className="size-10 rounded-full bg-muted border flex items-center justify-center text-muted-foreground [&_svg]:size-5 [&_span]:text-xl mb-3">
        {filtered ? (
          <PiFunnelBold />
        ) : model.admin.icon ? (
          <span className={model.admin.icon} />
        ) : (
          <PiFileTextBold />
        )}
      </div>
      {filtered ? (
        <>
          <div className="text-muted-foreground max-w-sm">
            {t("list_view.no_results")}
          </div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className={buttonVariants({
                variant: "outline",
                className: "mt-4",
              })}
            >
              {t("list_view.clear_all_filters")}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="text-muted-foreground max-w-sm">
            {t("list_view.empty_state")}
          </div>
          {model.admin.permissions.add_permission && (
            <Link
              to={`/content/${model.label}/new`}
              className={buttonVariants({ className: "mt-4" })}
            >
              {t("common.create")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
