import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { MoveMenu, Reorderable, RowDragHandle } from "@/components/reorderable";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useReorderableRow } from "@/hooks/use-reorderable-row";
import { getEdges } from "@/lib/reorder";
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
  selected,
  onToggle,
  filtered,
  onClear,
  reorder,
}: {
  items: Resource[];
  model: Model;
  // The selected ids, when the model offers bulk actions.
  selected?: Set<string>;
  onToggle?: (id: string) => void;
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
          {items.map((item, index) => (
            <SortableListViewRow
              key={item.id}
              item={item}
              edges={getEdges(index, items.length, reorder)}
              model={model}
              reorder={reorder}
              selected={selected?.has(item.id)}
              onToggle={onToggle}
            />
          ))}
        </Reorderable>
      ) : (
        items.map((item) => (
          <ListViewRow
            key={item.id}
            item={item}
            model={model}
            selected={selected?.has(item.id)}
            onToggle={onToggle}
          />
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
  selected,
  onToggle,
  reorder,
  sortable,
  edges,
}: {
  item: Resource;
  model: Model;
  // Defined when the model offers bulk actions: a checkbox appears on
  // hover and stays while the row is selected.
  selected?: boolean;
  onToggle?: (id: string) => void;
  reorder?: ReorderProps;
  sortable?: ReturnType<typeof useReorderableRow>;
  edges?: ReturnType<typeof getEdges>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const display = item.list_item_display;
  const selectable = onToggle !== undefined;

  return (
    <div
      ref={sortable?.ref}
      style={sortable?.style}
      onClick={() => navigate(`/content/${model.label}/${item.id}`)}
      className={cn(
        "group flex items-center gap-3 px-4 py-3 border-b select-none bg-card",
        "hover:bg-muted cursor-pointer last:border-b-0",
        {
          "pl-3": reorder || selectable,
          "bg-accent": selected,
          "bg-muted shadow-sm": sortable?.isDragging,
        },
      )}
    >
      {reorder && sortable && (
        <RowDragHandle
          handleProps={sortable.handleProps}
          disabledReason={reorder.disabledReason}
        />
      )}
      {selectable && (
        <span
          className={cn(
            "flex items-center transition-opacity",
            selected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={!!selected}
            aria-label={t("bulk.select_row")}
            onCheckedChange={() => onToggle(item.id)}
          />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {display?.title ?? item.__str__}
        </div>
        {display?.description ? (
          <div className="text-muted-foreground line-clamp-1">
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
          {...edges}
        />
      )}
    </div>
  );
}
