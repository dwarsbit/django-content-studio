import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TbCaretDownFilled, TbCaretUpFilled } from "react-icons/tb";

import { sizeOf, Thumb } from "@/components/media-library/file-meta";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";

/**
 * The media library's table view: a row per item with sortable
 * headers where the API supports ordering. Clicking a header cycles
 * ascending and descending; the ordering is remembered per media
 * model.
 */
export function TableView({
  items,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onOpen,
  ordering,
  onOrderingChange,
}: {
  items: MediaItem[];
  selectedIds: Set<string>;
  onToggleSelect(id: string): void;
  onToggleAll(ids: string[]): void;
  /** Opens the item for editing: clicking a row is opening, not
   * selecting — the checkboxes carry the selection. */
  onOpen(id: string): void;
  /** The current ordering param, e.g. "name" or "-size". */
  ordering: string | null;
  onOrderingChange(ordering: string | null): void;
}) {
  const { t } = useTranslation();
  const allSelected =
    items.length > 0 && items.every((item) => selectedIds.has(item.id));

  const columns: {
    name: string;
    label: string;
    /** Whether the API orders by this column. */
    sortable: boolean;
    render(item: MediaItem): ReactNode;
    /** Classes of the header and the cells. */
    className?: string;
    numeric?: boolean;
  }[] = [
    {
      name: "name",
      label: t("media_library.columns.name"),
      sortable: true,
      render: (item) => (
        <span className="flex items-center gap-2.5 min-w-0">
          <Thumb item={item} className="size-7" />
          <span className="font-medium line-clamp-1 break-all">
            {item.name}
          </span>
        </span>
      ),
    },
    {
      name: "type",
      label: t("media_library.columns.type"),
      sortable: true,
      render: (item) => (
        <span className="text-muted-foreground">
          {t(`media_library.file_types.${item.type}`)}
        </span>
      ),
    },
    {
      name: "size",
      label: t("media_library.columns.size"),
      sortable: true,
      numeric: true,
      render: (item) => sizeOf(item),
      className: "hidden md:table-cell",
    },
    {
      name: "tags",
      label: t("media_library.columns.tags"),
      sortable: false,
      render: (item) => (
        <span className="flex items-center gap-1">
          {item.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-muted-foreground"
            >
              {tag}
            </Badge>
          ))}
        </span>
      ),
      className: "hidden lg:table-cell",
    },
  ];

  const cycleOrdering = (name: string) => {
    if (ordering === name) {
      onOrderingChange(`-${name}`);
    } else if (ordering === `-${name}`) {
      onOrderingChange(null);
    } else {
      onOrderingChange(name);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label={t("bulk.select_all")}
                checked={allSelected}
                onCheckedChange={() =>
                  onToggleAll(items.map((item) => String(item.id)))
                }
              />
            </TableHead>
            {columns.map((column) => {
              const active =
                ordering === column.name || ordering === `-${column.name}`;
              const descending = ordering === `-${column.name}`;

              return (
                <TableHead
                  key={column.name}
                  aria-sort={
                    column.sortable
                      ? active
                        ? descending
                          ? "descending"
                          : "ascending"
                        : "none"
                      : undefined
                  }
                  className={cn(column.className, {
                    "[&_div]:justify-end": column.numeric,
                  })}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => cycleOrdering(column.name)}
                      className={cn(
                        "group inline-flex items-center gap-1 cursor-pointer rounded-sm hover:text-foreground outline-none",
                        "focus-visible:ring-2 focus-visible:ring-ring",
                        { "text-foreground": active },
                      )}
                    >
                      <span className="first-letter:uppercase">
                        {column.label}
                      </span>
                      <span className={cn({ invisible: !active })}>
                        {descending ? (
                          <TbCaretUpFilled />
                        ) : (
                          <TbCaretDownFilled />
                        )}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const selected = selectedIds.has(String(item.id));

            return (
              <TableRow
                key={item.id}
                data-state={selected ? "selected" : undefined}
                onClick={() => onOpen(String(item.id))}
              >
                <TableCell
                  className="w-10"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    aria-label={t("common.select_item")}
                    checked={selected}
                    onCheckedChange={() => onToggleSelect(String(item.id))}
                  />
                </TableCell>
                {columns.map((column) => (
                  <TableCell
                    key={column.name}
                    className={cn(column.className, {
                      "text-right tabular-nums": column.numeric,
                    })}
                  >
                    {column.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
