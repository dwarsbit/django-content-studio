import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Model, Resource } from "@/types";

/**
 * The list view: rows instead of a table. Each row is driven by the
 * resolved list display — a font-medium title, a muted description and a
 * meta badge — and opens the editor like a table row does.
 */
export function ListRowsView({
  items,
  model,
}: {
  items: Resource[];
  model: Model;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="w-full flex-1 scrollbar overflow-auto">
      {items.length === 0 && (
        <div className="text-center py-12">
          <span className="font-normal text-muted-foreground">
            {t("list_view.empty_state")}
          </span>
        </div>
      )}
      {items.map((item) => {
        const display = item.list_display;

        return (
          <div
            key={item.id}
            onClick={() =>
              navigate({ hash: `#editor:${model.label}:${item.id}` })
            }
            className={cn(
              "flex items-center gap-4 px-8 py-3 border-b select-none",
              "hover:bg-foreground/5 cursor-pointer last:border-b-0",
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {display?.title ?? item.__str__}
              </div>
              {display?.description ? (
                <div className="text-sm text-muted-foreground line-clamp-1">
                  {display.description}
                </div>
              ) : null}
            </div>
            {display?.meta ? (
              <Badge variant="outline" className="shrink-0">
                {display.meta}
              </Badge>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
