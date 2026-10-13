import bytes from "bytes";
import * as R from "ramda";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PiCaretUpDownBold } from "react-icons/pi";

import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";

/**
 * The media library's table view: a row per item with sortable
 * headers where the API supports ordering. Clicking a header cycles
 * ascending and descending; the ordering lives in the URL.
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
    /** The API's ordering field; null for unsortable columns. */
    sortable: boolean;
    render(item: MediaItem): ReactNode;
    className?: string;
  }[] = [
    {
      name: "name",
      label: t("media_library.columns.name"),
      sortable: true,
      render: (item) => (
        <span className="flex items-center gap-3 min-w-0">
          {item.type === "image" && item.thumbnail ? (
            <img
              draggable={false}
              src={item.thumbnail}
              alt=""
              className="size-8 rounded object-cover shrink-0"
            />
          ) : (
            <span className="size-8 rounded bg-muted shrink-0" />
          )}
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
      render: (item) => t(`media_library.file_types.${item.type}`),
    },
    {
      name: "size",
      label: t("media_library.columns.size"),
      sortable: true,
      render: (item) =>
        !R.isNil(item.size) && item.size > 0 ? bytes(item.size * 1000) : "",
      className: "hidden md:table-cell",
    },
    {
      name: "tags",
      label: t("media_library.columns.tags"),
      sortable: false,
      render: (item) => item.tags.join(", "),
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
    <table className="w-full border text-sm">
      <thead>
        <tr className="border-b bg-accent">
          <th className="w-10 px-3 py-2">
            <input
              type="checkbox"
              aria-label={t("bulk.select_all")}
              checked={allSelected}
              onChange={() => onToggleAll(items.map((item) => String(item.id)))}
              className="size-4 accent-primary cursor-pointer"
            />
          </th>
          {columns.map((column) => (
            <th
              key={column.name}
              className={cn("px-3 py-2 text-left", column.className)}
            >
              {column.sortable ? (
                <button
                  type="button"
                  onClick={() => cycleOrdering(column.name)}
                  className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                >
                  {column.label}
                  {ordering === column.name ||
                  ordering === `-${column.name}` ? (
                    <PiCaretUpDownBold className="size-3" />
                  ) : (
                    <PiCaretUpDownBold className="size-3 opacity-30" />
                  )}
                </button>
              ) : (
                column.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={item.id}
            className="border-b last:border-b-0 cursor-pointer hover:bg-accent"
            onClick={() => onOpen(String(item.id))}
          >
            <td className="px-3 py-2">
              <input
                type="checkbox"
                aria-label={t("common.select_item")}
                checked={selectedIds.has(String(item.id))}
                onChange={() => onToggleSelect(String(item.id))}
                onClick={(e) => e.stopPropagation()}
                className="size-4 accent-primary cursor-pointer"
              />
            </td>
            {columns.map((column) => (
              <td
                key={column.name}
                className={cn("px-3 py-2", column.className)}
              >
                {column.render(item)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
