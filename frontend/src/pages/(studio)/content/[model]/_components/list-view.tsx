import { useNavigate } from "react-router";

import { MoveMenu, Reorderable, RowDragHandle } from "@/components/reorderable";
import { Badge } from "@/components/ui/badge";
import { useReorderableRow } from "@/hooks/use-reorderable-row";
import { cn } from "@/lib/utils";
import type { Model, Resource } from "@/types";

import { EmptyState } from "./empty-state";
import type { ReorderProps } from "./table-view";

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
  reorder,
}: {
  items: Resource[];
  model: Model;
  // Whether a search term or remembered filters narrow the list;
  // drives the empty state's no-results notice.
  filtered?: boolean;
  // Clears the search term and the remembered filters.
  onClear?: () => void;
  reorder?: ReorderProps;
}) {
  return (
    <div className="w-full flex-1 border rounded-lg overflow-hidden">
      {items.length === 0 && (
        <EmptyState model={model} filtered={!!filtered} onClear={onClear} />
      )}
      {reorder ? (
        <Reorderable
          ids={items.map((item) => item.id)}
          getLabel={(id) =>
            items.find((item) => String(item.id) === String(id))?.__str__ ?? id
          }
          onMove={reorder.onMove}
        >
          {items.map((item) => (
            <SortableListViewRow
              key={item.id}
              item={item}
              model={model}
              reorder={reorder}
            />
          ))}
        </Reorderable>
      ) : (
        items.map((item) => (
          <ListViewRow key={item.id} item={item} model={model} />
        ))
      )}
    </div>
  );
}

function SortableListViewRow(
  props: Omit<Parameters<typeof ListViewRow>[0], "sortable"> & {
    reorder: ReorderProps;
  },
) {
  const sortable = useReorderableRow(
    props.item.id,
    !!props.reorder.disabledReason,
  );

  return <ListViewRow {...props} sortable={sortable} />;
}

function ListViewRow({
  item,
  model,
  reorder,
  sortable,
}: {
  item: Resource;
  model: Model;
  reorder?: ReorderProps;
  sortable?: ReturnType<typeof useReorderableRow>;
}) {
  const navigate = useNavigate();
  const display = item.list_item_display;

  return (
    <div
      ref={sortable?.ref}
      style={sortable?.style}
      onClick={() => navigate(`/content/${model.label}/${item.id}`)}
      className={cn(
        "flex items-center gap-4 px-8 py-3 border-b select-none bg-background",
        "hover:bg-muted cursor-pointer last:border-b-0",
        { "pl-3 pr-4": reorder, "bg-muted shadow-sm": sortable?.isDragging },
      )}
    >
      {reorder && sortable && (
        <RowDragHandle
          handleProps={sortable.handleProps}
          disabledReason={reorder.disabledReason}
        />
      )}
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
      {reorder && (
        <MoveMenu
          disabledReason={reorder.disabledReason}
          onMove={(move) => reorder.onMove(item.id, move)}
        />
      )}
    </div>
  );
}
