import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiCaretDownBold, PiXBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  ICON_PREFIX,
  iconName,
  matchesIcon,
  parseIconNames,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { ModelField, WidgetProps } from "@/types";

// Icons per row of the grid, for the arrow keys.
const COLUMNS = 8;
// The most icons the grid shows at once; searching narrows it down.
const MAX_SHOWN = 320;

function useIconNames(enabled: boolean) {
  return useQuery({
    queryKey: ["icon-names"],
    enabled,
    staleTime: Infinity,
    // The stylesheet the page already loaded for the icons, so it
    // comes from the browser's cache and always matches the font.
    queryFn: async () => {
      const response = await fetch(
        `${window.DCS_STATIC_PREFIX ?? "/"}icons/pi/style.css`,
      );

      if (!response.ok) {
        throw new Error(`Could not load the icons (${response.status}).`);
      }

      return parseIconNames(await response.text());
    },
  });
}

/**
 * A Phosphor icon, picked from a searchable grid of the icons Content
 * Studio ships. The value is the icon's class, such as "ph-bold
 * ph-star", as Callout's icon option and block icons take it.
 */
export function IconPickerWidget({
  field,
  value,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  field?: ModelField;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
} & WidgetProps<string | null>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const { data: names, isLoading, isError } = useIconNames(open);
  const selected = iconName(value);
  const matches = useMemo(
    () => (names ?? []).filter((name) => matchesIcon(name, search)),
    [names, search],
  );
  const shown = matches.slice(0, MAX_SHOWN);

  function pick(name: string) {
    onChange(`${ICON_PREFIX}${name}`);
    setOpen(false);
    setSearch("");
  }

  function moveFocus(event: React.KeyboardEvent) {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -COLUMNS,
      ArrowDown: COLUMNS,
    };
    const step = steps[event.key];
    const buttons = [
      ...(gridRef.current?.querySelectorAll("button") ?? []),
    ] as HTMLButtonElement[];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (step === undefined || index === -1) {
      return;
    }

    event.preventDefault();
    buttons[Math.min(Math.max(index + step, 0), buttons.length - 1)]?.focus();
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            aria-label={field?.verbose_name}
            className="min-w-48 justify-start font-normal"
          >
            {value ? (
              <>
                {selected && <i className={value} aria-hidden="true" />}
                <span className="truncate">{selected ?? value}</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t("widgets.icon_picker_widget.choose")}
              </span>
            )}
            <PiCaretDownBold className="ml-auto text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[22rem] p-2">
          <Input
            autoFocus
            value={search}
            placeholder={t("widgets.icon_picker_widget.search")}
            aria-label={t("widgets.icon_picker_widget.search")}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                gridRef.current?.querySelector("button")?.focus();
              } else if (e.key === "Enter" && shown.length > 0) {
                e.preventDefault();
                pick(shown[0]);
              }
            }}
          />
          <div className="mt-2 h-64 overflow-y-auto scrollbar">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            ) : isError ? (
              <p className="p-2 text-sm text-destructive">
                {t("widgets.icon_picker_widget.load_error")}
              </p>
            ) : shown.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">
                {t("widgets.icon_picker_widget.no_results")}
              </p>
            ) : (
              <div
                ref={gridRef}
                role="listbox"
                aria-label={t("widgets.icon_picker_widget.icons")}
                className="grid grid-cols-8 gap-1"
                onKeyDown={moveFocus}
              >
                {shown.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={name === selected}
                    aria-label={name}
                    title={name}
                    onClick={() => pick(name)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-md text-lg outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                      name === selected && "bg-accent ring-1 ring-ring",
                    )}
                  >
                    <i className={`${ICON_PREFIX}${name}`} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
          {matches.length > MAX_SHOWN && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("widgets.icon_picker_widget.more", {
                count: matches.length - MAX_SHOWN,
              })}
            </p>
          )}
        </PopoverContent>
      </Popover>
      {value && !field?.required && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("common.clear")}
          title={t("common.clear")}
          onClick={() => onChange("")}
        >
          <PiXBold />
        </Button>
      )}
    </div>
  );
}
