"use client";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PiCaretDownBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TimeWidget } from "@/components/widgets/time-widget";
import { getDateLimits } from "@/lib/date-limits";
import type {
  DateString,
  DateWidgetOptions,
  ModelField,
  WidgetProps,
} from "@/types";

dayjs.extend(localizedFormat);

export function DateTimeWidget({
  value,
  onChange,
  field,
  options,
}: {
  field: ModelField;
} & WidgetProps<DateString | null, DateWidgetOptions>) {
  const { t } = useTranslation();
  const limits = getDateLimits(options);
  const [open, setOpen] = React.useState(false);
  const date$ = React.useMemo(
    () => (value ? dayjs(value, "YYYY-MM-DD HH:mm") : null),
    [value],
  );
  const [time, setTime] = useState(date$?.format("HH:mm") ?? "00:00");
  const [date, setDate] = useState(date$?.toDate() ?? undefined);
  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen && date && time) {
          onChange?.(`${dayjs(date).format("YYYY-MM-DD")}T${time ?? "00:00"}`);
        }
      }}
    >
      <PopoverTrigger className="h-9 border border-border hover:border-ring data-[state=open]:border-ring px-3 rounded-md flex items-center select-none cursor-pointer">
        <div className="flex-1 text-left">
          {date$ ? (
            <span className="text-foreground font-medium">
              {date$.format("ll LT")}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("widgets.date_picker.placeholder")}
            </span>
          )}
        </div>
        <PiCaretDownBold className="size-4 text-muted-foreground/50" />
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          fixedWeeks
          {...limits}
          defaultMonth={date$?.toDate()}
          selected={date}
          onSelect={(date) => {
            if (date) {
              setDate(date);
            }
          }}
        />
        <div className="p-3 border-t">
          <TimeWidget value={time} onChange={setTime} />
        </div>
        {!field.required && value && (
          <div className="p-3 border-t">
            <Button
              variant="outline"
              className="w-full"
              size="sm"
              onClick={() => {
                onChange?.(null);
                setOpen(false);
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
