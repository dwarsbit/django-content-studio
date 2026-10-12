import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { useTranslation } from "react-i18next";
import { PiCaretDownBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FieldType } from "@/types";

import type { FilterComponentProps } from "./types";

dayjs.extend(localizedFormat);

/**
 * A date range filter: the calendar's from/to become `__gte`/`__lte`
 * bounds. A DateField filters on plain dates; a DateTimeField bounds
 * the range to the start and end of the picked days.
 */
export function DateRangeFilter({
  field,
  values,
  onChange,
}: FilterComponentProps) {
  const { t } = useTranslation();
  const isDateTime = field.type === FieldType.DateTimeField;
  const from = values["gte"] ? dayjs(values["gte"]) : null;
  const to = values["lte"] ? dayjs(values["lte"]) : null;

  const bound = (date: Date, lookup: "gte" | "lte") =>
    isDateTime
      ? `${dayjs(date).format("YYYY-MM-DD")}T${lookup === "gte" ? "00:00" : "23:59"}`
      : dayjs(date).format("YYYY-MM-DD");

  const range = [from?.format("ll"), to?.format("ll")]
    .filter(Boolean)
    .join(" – ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          {field.verbose_name}
          <span className="empty:hidden font-normal text-muted-foreground">
            {range}
          </span>
          <PiCaretDownBold className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={from?.toDate()}
          selected={
            from || to ? { from: from?.toDate(), to: to?.toDate() } : undefined
          }
          onSelect={(selected) => {
            onChange({
              gte: selected?.from ? bound(selected.from, "gte") : null,
              lte: selected?.to ? bound(selected.to, "lte") : null,
            });
          }}
        />
        {(values["gte"] || values["lte"]) && (
          <div className="p-3 border-t">
            <Button
              variant="outline"
              className="w-full"
              size="sm"
              onClick={() => {
                onChange({ gte: null, lte: null });
              }}
            >
              {t("common.clear")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
