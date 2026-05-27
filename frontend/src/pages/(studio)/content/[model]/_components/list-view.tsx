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
import type { Model } from "@/types";

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
  const fields = model.admin.list.display.filter(
    ({ name }) => !R.isNil(model.fields[name]),
  );
  const ordering = searchParams.get("ordering");
  const { sortable_by, display } = model.admin.list;

  return (
    <div className="w-full flex-1 scrollbar overflow-auto">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            {display.map(({ name, description }) => {
              const label = description ?? model.fields[name]?.verbose_name;
              const active = name === ordering?.replace(/^-/, "");
              const descending = !!ordering?.startsWith("-");
              const isSortable =
                R.isNil(sortable_by) || sortable_by.includes(name);

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
              onClick={() =>
                navigate({ hash: `#editor:${model.label}:${item.id}` })
              }
            >
              {fields.map(({ name, empty_value }) => (
                <TableCell key={name}>
                  <div className="truncate min-h-8 items-center flex">
                    <FormatRenderer
                      value={item[name]}
                      field={model.fields[name]}
                      emptyValue={empty_value}
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
