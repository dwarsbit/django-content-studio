import { useNavigate } from "react-router";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Model, Resource } from "@/types";

import { EmptyState } from "./empty-state";

/**
 * The list view: rows instead of a table. Each row is driven by the
 * resolved list display — a font-medium title, a muted description and a
 * meta badge — and opens the editor like a table row does.
 */
export function ListView({
  items,
  model,
  filtered,
  onClear,
}: {
  items: Resource[];
  model: Model;
  // Whether a search term or remembered filters narrow the list;
  // drives the empty state's no-results notice.
  filtered?: boolean;
  // Clears the search term and the remembered filters.
  onClear?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="w-full flex-1 border rounded-lg overflow-hidden">
      {items.length === 0 && (
        <EmptyState
          model={model}
          filtered={!!filtered}
          onClear={onClear}
        />
      )}
      {items.map((item) => {
        const display = item.list_display;

        return (
          <div
            key={item.id}
            onClick={() => navigate(`/content/${model.label}/${item.id}`)}
            className={cn(
              "flex items-center gap-4 px-8 py-3 border-b select-none",
              "hover:bg-muted cursor-pointer last:border-b-0",
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
