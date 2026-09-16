"use client";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { PiCaretDownBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DateString, ModelField } from "@/types";

dayjs.extend(localizedFormat);

export function DateWidget({
  value,
  onChange,
  field,
}: {
  value?: DateString;
  onChange?: any;
  field: ModelField;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const date$ = React.useMemo(
    () => (value ? dayjs(value, "YYYY-MM-DD") : null),
    [value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="h-8 border border-gray-300 hover:border-gray-400 px-3 rounded-md shadow-xs cursor-pointer data-[state=open]:border-gray-400 flex items-center select-none">
        <div className="flex-1 text-left">
          {date$ ? (
            <span className="text-gray-700 font-medium">
              {date$.format("ll")}
            </span>
          ) : (
            <span className="text-gray-400">
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
          defaultMonth={date$?.toDate()}
          selected={date$?.toDate()}
          onSelect={(date) => {
            if (date) {
              onChange?.(dayjs(date).format("YYYY-MM-DD"));
            }
            setOpen(false);
          }}
        />
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
