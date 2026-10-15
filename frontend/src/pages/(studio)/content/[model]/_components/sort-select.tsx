import { useTranslation } from "react-i18next";
import { PiArrowDownBold, PiArrowUpBold } from "react-icons/pi";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Model } from "@/types";

// The select's stand-in for "no ordering": the server's default
// ordering applies. Radix rejects empty item values, so the sentinel
// cannot collide with a field name.
const DEFAULT = "__default__";

/**
 * The list view's sort control, shown when the studio declares
 * sortable_by: a select for the field and a direction toggle next to
 * it. Both change the remembered ordering.
 */
export function SortSelect({
  model,
  ordering,
  onOrderingChange,
}: {
  model: Model;
  // The remembered ordering: a field name, prefixed with "-" for
  // descending, or null for the default ordering.
  ordering: string | null;
  onOrderingChange: (next: string | null) => void;
}) {
  const { t } = useTranslation();
  const sortableBy = model.admin.list.sortable_by ?? [];
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
        onValueChange={(value) => {
          if (value === DEFAULT) {
            onOrderingChange(null);
          } else {
            onOrderingChange(descending ? `-${value}` : value);
          }
        }}
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
          onClick={() => onOrderingChange(descending ? field : `-${field}`)}
          className={cn(
            "flex items-center justify-center size-8 rounded-md border cursor-pointer outline-none",
            "hover:bg-foreground/5 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {descending ? <PiArrowDownBold /> : <PiArrowUpBold />}
        </button>
      )}
    </div>
  );
}
