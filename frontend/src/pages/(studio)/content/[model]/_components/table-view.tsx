import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { TbCaretDownFilled, TbCaretUpFilled } from "react-icons/tb";
import { useNavigate } from "react-router";

import { FormatRenderer } from "@/components/formats/renderer";
import { MoveMenu, Reorderable, RowDragHandle } from "@/components/reorderable";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReorderableRow } from "@/hooks/use-reorderable-row";
import type { Move } from "@/lib/reorder";
import { cn } from "@/lib/utils";
import type { FieldFormat, Id, Model } from "@/types";

import { EmptyState } from "./empty-state";

type Row = { id: string; __str__?: string; [p: string]: unknown };

// Reordering, when the list offers it: the moves a drop or the row
// menu make, and why reordering is off right now (null when it is on).
export interface ReorderProps {
  disabledReason: string | null;
  onMove(id: Id, move: Move): void;
}

export function TableView({
  items,
  model,
  selected,
  ordering,
  onOrderingChange,
  onToggle,
  onToggleAll,
  filtered,
  onClear,
  reorder,
}: {
  items: Row[];
  model: Model;
  // The selected ids, when the model offers bulk actions.
  selected?: Set<string>;
  // The remembered ordering: a field name, prefixed with "-" for
  // descending, or null for the default ordering.
  ordering?: string | null;
  onOrderingChange?: (next: string | null) => void;
  onToggle?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
  // Whether a search term or remembered filters narrow the list;
  // drives the empty state's no-results notice.
  filtered?: boolean;
  // Clears the search term and the remembered filters.
  onClear?: () => void;
  reorder?: ReorderProps;
}) {
  const { t } = useTranslation();
  const fields = model.admin.list.display;
  const { sortable_by, display } = model.admin.list;
  const hasActions = (model.admin.list.actions ?? []).length > 0;
  const allSelected =
    hasActions &&
    items.length > 0 &&
    items.every((item) => selected?.has(item.id));

  return (
    <div className="w-full flex-1 scrollbar overflow-auto border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            {reorder && (
              <TableHead className="sticky top-0 z-10 bg-muted w-8">
                <span className="sr-only">{t("reorder.drag")}</span>
              </TableHead>
            )}
            {hasActions && (
              <TableHead className="sticky top-0 z-10 bg-muted w-10">
                <Checkbox
                  checked={allSelected}
                  aria-label={t("bulk.select_all")}
                  onCheckedChange={() =>
                    onToggleAll?.(items.map((item) => item.id))
                  }
                />
              </TableHead>
            )}
            {display.map(({ name, header }) => {
              const label = header ?? model.fields[name]?.verbose_name;
              const active = name === ordering?.replace(/^-/, "");
              const descending = !!ordering?.startsWith("-");
              // Computed columns have no queryset equivalent to sort on.
              const isSortable =
                !R.isNil(model.fields[name]) &&
                (R.isNil(sortable_by) || sortable_by.includes(name));

              return (
                <TableHead
                  key={name}
                  aria-sort={
                    isSortable
                      ? active
                        ? descending
                          ? "descending"
                          : "ascending"
                        : "none"
                      : undefined
                  }
                  className="sticky top-0 z-10 bg-muted"
                >
                  {label && isSortable ? (
                    <button
                      onClick={() => {
                        if (!active) {
                          onOrderingChange?.(name);
                        } else if (descending) {
                          onOrderingChange?.(null);
                        } else {
                          onOrderingChange?.(`-${name}`);
                        }
                      }}
                      className={cn(
                        "group inline-flex items-center gap-1 cursor-pointer hover:text-secondary-foreground",
                        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      <span>{label}</span>
                      <span
                        className={cn({
                          invisible: !active,
                        })}
                      >
                        {descending ? (
                          <TbCaretUpFilled />
                        ) : (
                          <TbCaretDownFilled />
                        )}
                      </span>
                    </button>
                  ) : (
                    label
                  )}
                </TableHead>
              );
            })}
            {reorder && (
              <TableHead className="sticky top-0 z-10 bg-muted w-10">
                <span className="sr-only">{t("reorder.menu")}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {R.isEmpty(items) && (
            <TableRow>
              <TableCell
                colSpan={
                  fields.length + (hasActions ? 1 : 0) + (reorder ? 2 : 0)
                }
                className="text-center"
              >
                <EmptyState
                  model={model}
                  filtered={!!filtered}
                  onClear={onClear}
                />
              </TableCell>
            </TableRow>
          )}
          {reorder ? (
            <Reorderable
              ids={items.map((item) => item.id)}
              getLabel={(id) =>
                items.find((item) => String(item.id) === String(id))?.__str__ ??
                id
              }
              onMove={reorder.onMove}
            >
              {items.map((item) => (
                <SortableTableViewRow
                  key={item.id}
                  item={item}
                  model={model}
                  hasActions={hasActions}
                  selected={!!selected?.has(item.id)}
                  onToggle={onToggle}
                  reorder={reorder}
                />
              ))}
            </Reorderable>
          ) : (
            items.map((item) => (
              <TableViewRow
                key={item.id}
                item={item}
                model={model}
                hasActions={hasActions}
                selected={!!selected?.has(item.id)}
                onToggle={onToggle}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableTableViewRow(
  props: Omit<Parameters<typeof TableViewRow>[0], "sortable"> & {
    reorder: ReorderProps;
  },
) {
  const sortable = useReorderableRow(
    props.item.id,
    !!props.reorder.disabledReason,
  );

  return <TableViewRow {...props} sortable={sortable} />;
}

function TableViewRow({
  item,
  model,
  hasActions,
  selected,
  onToggle,
  reorder,
  sortable,
}: {
  item: Row;
  model: Model;
  hasActions: boolean;
  selected: boolean;
  onToggle?: (id: string) => void;
  reorder?: ReorderProps;
  sortable?: ReturnType<typeof useReorderableRow>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fields = model.admin.list.display;

  return (
    <TableRow
      ref={sortable?.ref}
      style={sortable?.style}
      onClick={() => navigate(`/content/${model.label}/${item.id}`)}
      className={cn({ "bg-muted shadow-sm": sortable?.isDragging })}
    >
      {reorder && sortable && (
        <TableCell className="w-8 pr-0">
          <RowDragHandle
            handleProps={sortable.handleProps}
            disabledReason={reorder.disabledReason}
          />
        </TableCell>
      )}
      {hasActions && (
        <TableCell
          className="w-10"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            aria-label={t("bulk.select_row")}
            onCheckedChange={() => onToggle?.(item.id)}
          />
        </TableCell>
      )}
      {fields.map(({ name, format }) => (
        <TableCell key={name}>
          <div className="truncate min-h-8 items-center flex">
            <FormatRenderer
              value={item[name]}
              field={model.fields[name]}
              formatName={(format as FieldFormat | null) ?? undefined}
            />
          </div>
        </TableCell>
      ))}
      {reorder && (
        <TableCell
          className="w-10"
          onClick={(event) => event.stopPropagation()}
        >
          <MoveMenu
            disabledReason={reorder.disabledReason}
            onMove={(move) => reorder.onMove(item.id, move)}
          />
        </TableCell>
      )}
    </TableRow>
  );
}
