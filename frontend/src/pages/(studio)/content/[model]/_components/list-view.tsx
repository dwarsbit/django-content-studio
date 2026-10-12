import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { PiArrowDownBold, PiArrowUpBold } from "react-icons/pi";
import { useNavigate, useSearchParams } from "react-router";

import { FormatRenderer } from "@/components/formats/renderer";
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

export function ListView({
  items,
  model,
}: {
  items: { id: string; [p: string]: unknown }[];
  model: Model;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fields = model.admin.list.display;
  const ordering = searchParams.get("ordering");
  const { sortable_by, display } = model.admin.list;

  return (
    <div className="w-full flex-1 scrollbar overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {display.map(({ name, header }) => {
              const label = header ?? model.fields[name]?.verbose_name;
              const active = name === ordering?.replace(/^-/, "");
              const descending = !!ordering?.startsWith("-");
              // Computed columns have no queryset equivalent to sort on.
              const isSortable =
                !R.isNil(model.fields[name]) &&
                (R.isNil(sortable_by) || sortable_by.includes(name));

              return (
                <TableHead key={name} className="sticky top-0 z-10 bg-card">
                  {label && isSortable ? (
                    <button
                      onClick={() =>
                        setSearchParams((searchParams) => {
                          if (!active) {
                            searchParams.set("ordering", name);
                            return searchParams;
                          }

                          if (descending) {
                            searchParams.delete("ordering");
                            return searchParams;
                          }

                          searchParams.set("ordering", `-${name}`);

                          return searchParams;
                        })
                      }
                      className={cn(
                        "group inline-flex items-center gap-1 hover:bg-foreground/10 p-1 -mx-1 rounded-md cursor-pointer",
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
              <TableCell colSpan={fields.length} className="text-center py-12">
                <span className="font-normal text-muted-foreground">
                  {t("list_view.empty_state")}
                </span>
              </TableCell>
            </TableRow>
          )}
          {items.map((item) => (
            <TableRow
              key={item.id}
              onClick={() => navigate(`/content/${model.label}/${item.id}`)}
            >
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
