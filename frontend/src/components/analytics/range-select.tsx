import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";
import { PiCalendarBlankBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { type AnalyticsRange, PRESETS, type RangeKey } from "./data";

dayjs.extend(localizedFormat);

/** A custom range as "Oct 1 – Oct 31, 2026". */
export function customLabel(range: AnalyticsRange) {
  if (!range.start || !range.end) return "";
  const start = dayjs(range.start);
  const end = dayjs(range.end);

  return start.isSame(end, "day")
    ? end.format("ll")
    : `${start.format(start.year() === end.year() ? "MMM D" : "ll")} – ${end.format("ll")}`;
}

/**
 * The report's period: the presets, or a custom range picked on a
 * calendar (both days included).
 */
export function RangeSelect({
  value,
  onChange,
  size = "default",
}: {
  value: AnalyticsRange;
  onChange(range: AnalyticsRange): void;
  size?: "sm" | "default";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const short = size === "sm";
  const label = (key: RangeKey) =>
    t(`analytics.ranges.${short && key !== "today" ? `${key}_short` : key}`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="shrink-0">
          <Select
            value={value.key}
            onValueChange={(key: RangeKey) => {
              if (key === "custom") {
                setDraft(
                  value.start && value.end
                    ? {
                        from: dayjs(value.start).toDate(),
                        to: dayjs(value.end).toDate(),
                      }
                    : undefined,
                );
                setOpen(true);
              } else {
                onChange({ key });
              }
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("analytics.range")}
              className={cn(short ? "text-xs gap-1 px-2" : "min-w-36")}
            >
              <SelectValue>
                {value.key === "custom" && value.start
                  ? customLabel(value)
                  : label(value.key)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {PRESETS.map((key) => (
                <SelectItem key={key} value={key}>
                  {label(key)}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value="custom">
                {t("analytics.ranges.custom")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-auto overflow-hidden p-0" align="end">
        <Calendar
          mode="range"
          numberOfMonths={short ? 1 : 2}
          defaultMonth={draft?.from ?? dayjs().subtract(1, "month").toDate()}
          disabled={{ after: new Date() }}
          selected={draft}
          onSelect={setDraft}
        />
        <div className="p-3 border-t flex items-center gap-2">
          <PiCalendarBlankBold className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground flex-1">
            {draft?.from
              ? customLabel({
                  key: "custom",
                  start: dayjs(draft.from).format("YYYY-MM-DD"),
                  end: dayjs(draft.to ?? draft.from).format("YYYY-MM-DD"),
                })
              : t("analytics.pick_dates")}
          </span>
          <Button
            size="sm"
            disabled={!draft?.from}
            onClick={() => {
              if (!draft?.from) return;
              onChange({
                key: "custom",
                start: dayjs(draft.from).format("YYYY-MM-DD"),
                end: dayjs(draft.to ?? draft.from).format("YYYY-MM-DD"),
              });
              setOpen(false);
            }}
          >
            {t("analytics.apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
