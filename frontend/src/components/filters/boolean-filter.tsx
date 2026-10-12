import { useTranslation } from "react-i18next";
import { PiCaretDownBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { FilterComponentProps } from "./types";

/** The URL values of the tri-state options; "all" clears the filter. */
const ALL = "all";
const TRUE = "true";
const FALSE = "false";

/**
 * A tri-state boolean filter: all (no filter), yes and no. The plain
 * field value is a boolean literal, which the filter backend casts.
 */
export function BooleanFilter({
  field,
  values,
  onChange,
}: FilterComponentProps) {
  const { t } = useTranslation();
  const value = values[""] ?? ALL;

  const options: [string, string][] = [
    [ALL, t("list_view.filters.all")],
    [TRUE, t("list_view.filters.yes")],
    [FALSE, t("list_view.filters.no")],
  ];
  const label = options.find(([key]) => key === value)?.[1];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          {field.verbose_name}
          <span className="empty:hidden font-normal text-muted-foreground">
            {value !== ALL ? label : ""}
          </span>
          <PiCaretDownBold className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange({ "": next === ALL ? null : next })}
        >
          {options.map(([key, label]) => (
            <DropdownMenuRadioItem key={key} value={key}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
