import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { FilterTrigger } from "./filter-trigger";
import type { FilterComponentProps } from "./types";

/**
 * A numeric range filter: the min and max inputs commit on blur or
 * Enter, so typing does not fire a request per keystroke. Each bound
 * is optional and writes a `__gte`/`__lte` lookup.
 */
export function NumberFilter({
  field,
  values,
  onChange,
}: FilterComponentProps) {
  const { t } = useTranslation();
  const [min, setMin] = useState(values["gte"] ?? "");
  const [max, setMax] = useState(values["lte"] ?? "");

  // External value changes (clear all filters) reset the inputs;
  // adjusting state during render is React's sanctioned way to react
  // to an external change.
  const [lastGte, setLastGte] = useState(values["gte"] ?? "");
  const [lastLte, setLastLte] = useState(values["lte"] ?? "");

  if ((values["gte"] ?? "") !== lastGte) {
    setLastGte(values["gte"] ?? "");
    setMin(values["gte"] ?? "");
  }
  if ((values["lte"] ?? "") !== lastLte) {
    setLastLte(values["lte"] ?? "");
    setMax(values["lte"] ?? "");
  }

  const commit = () => {
    if (min !== (values["gte"] ?? "") || max !== (values["lte"] ?? "")) {
      onChange({ gte: min || null, lte: max || null });
    }
  };

  const range = [min, max].filter(Boolean).join(" – ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterTrigger
          label={field.verbose_name}
          value={range}
          onClear={() => {
            setMin("");
            setMax("");
            onChange({ gte: null, lte: null });
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 flex flex-col gap-3" align="start">
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          {t("list_view.filters.min")}
          <Input
            type="number"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          {t("list_view.filters.max")}
          <Input
            type="number"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </label>
        {(values["gte"] || values["lte"]) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMin("");
              setMax("");
              onChange({ gte: null, lte: null });
            }}
          >
            {t("common.clear")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
