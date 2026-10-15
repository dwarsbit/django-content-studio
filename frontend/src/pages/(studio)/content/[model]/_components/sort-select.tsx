import { useTranslation } from "react-i18next";
import { PiArrowDownBold, PiArrowUpBold } from "react-icons/pi";
import { useSearchParams } from "react-router";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Model } from "@/types";

// The select's stand-in for "no ordering parameter": the server's
// default ordering applies. Radix rejects empty item values, so the
// sentinel cannot collide with a field name.
const DEFAULT = "__default__";

/**
 * The list view's sort control, shown when the studio declares
 * sortable_by: a select for the field and a direction toggle next to
 * it. Both write the shared ordering URL parameter.
 */
export function SortSelect({ model }: { model: Model }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const sortableBy = model.admin.list.sortable_by ?? [];
  const ordering = searchParams.get("ordering");
  const field = ordering?.replace(/^-/, "");
  const descending = !!ordering?.startsWith("-");

  const label = (name: string) =>
    model.admin.list.display.find((column) => column.name === name)?.header ??
    model.fields[name]?.verbose_name ??
    name;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={field ?? DEFAULT}
        onValueChange={(value) =>
          setSearchParams((searchParams) => {
            if (value === DEFAULT) {
              searchParams.delete("ordering");
            } else {
              searchParams.set("ordering", descending ? `-${value}` : value);
            }

            return searchParams;
          })
        }
      >
        <SelectTrigger size="sm" aria-label={t("list_view.sort_by")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT}>
            {t("list_view.default_ordering")}
          </SelectItem>
          {sortableBy.map((name) => (
            <SelectItem key={name} value={name}>
              {label(name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field && (
        <button
          type="button"
          title={
            descending
              ? t("list_view.sort_ascending")
              : t("list_view.sort_descending")
          }
          aria-label={
            descending
              ? t("list_view.sort_ascending")
              : t("list_view.sort_descending")
          }
          onClick={() =>
            setSearchParams((searchParams) => {
              searchParams.set("ordering", descending ? field : `-${field}`);
              return searchParams;
            })
          }
          className={cn(
            "flex items-center justify-center size-8 rounded-md border cursor-pointer",
            "hover:bg-foreground/5 text-muted-foreground",
          )}
        >
          {descending ? <PiArrowDownBold /> : <PiArrowUpBold />}
        </button>
      )}
    </div>
  );
}
