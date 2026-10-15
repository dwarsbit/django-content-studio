import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { PiArrowDownBold, PiArrowUpBold } from "react-icons/pi";
import { useNavigate } from "react-router";

import { FormatRenderer } from "@/components/formats/renderer";
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
import type { FieldFormat, Model } from "@/types";

import { EmptyState } from "./empty-state";

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
}: {
  items: { id: string; [p: string]: unknown }[];
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
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
                        "group inline-flex items-center gap-1 hover:bg-foreground/10 p-1 -mx-1 rounded-md cursor-pointer",
                        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      <span>{label}</span>
                      <span
                        className={cn({
                          "invisible group-hover:visible": !active,
                        })}
                      >
                        {descending || !active ? (
                          <PiArrowUpBold />
                        ) : (
                          <PiArrowDownBold />
                        )}
                      </span>
                    </button>
                  ) : (
                    label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {R.isEmpty(items) && (
            <TableRow>
              <TableCell
                colSpan={fields.length + (hasActions ? 1 : 0)}
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
          {items.map((item) => (
            <TableRow
              key={item.id}
              onClick={() => navigate(`/content/${model.label}/${item.id}`)}
            >
              {hasActions && (
                <TableCell
                  className="w-10"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    checked={selected?.has(item.id)}
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
