"use client";

import * as React from "react";
import {
  HslaColorPicker,
  HslColorPicker,
  RgbaColorPicker,
  RgbColorPicker,
} from "react-colorful";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type ColorFormat,
  formatColor,
  normalizeColor,
  parseColor,
  toHsl,
  toRgb,
} from "@/lib/colors";
import { cn } from "@/lib/utils";

export interface ColorPickerProps {
  /** The color (controlled); an empty string is no color. */
  value: string | null | undefined;
  /** Called with the next color, in `format`. */
  onChange: (value: string) => void;
  /** The notation the picker writes: "hex", "rgb" or "hsl". */
  format?: ColorFormat;
  /** Whether translucent colors can be picked; adds an alpha slider. */
  alpha?: boolean;
  /** Whether to show a text input to type or paste a color. */
  showInput?: boolean;
  /** Colors offered below the picker, such as a brand palette. */
  swatches?: string[];
  /** Shows a clear button in the popover. */
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  labels?: { picker?: string; input?: string; clear?: string };
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

// The checkerboard behind a translucent color.
const CHECKERBOARD =
  "bg-[conic-gradient(var(--muted)_25%,var(--background)_0_50%,var(--muted)_0_75%,var(--background)_0)] bg-size-[8px_8px]";

function Swatch({
  color,
  className,
}: {
  color: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block size-5 shrink-0 overflow-hidden rounded-sm border border-border",
        CHECKERBOARD,
        className,
      )}
    >
      {color && (
        <span className="absolute inset-0" style={{ background: color }} />
      )}
    </span>
  );
}

/**
 * A color swatch that opens a color picker, with an optional text input
 * and preset swatches. Colors are written in `format`; a typed color is
 * converted to it when the input loses focus.
 */
export function ColorPicker({
  value,
  onChange,
  format = "hex",
  alpha = false,
  showInput = true,
  swatches,
  clearable = false,
  disabled,
  id,
  placeholder,
  labels = {},
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: ColorPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const [shown, setShown] = React.useState(value);
  const color = React.useMemo(() => parseColor(value), [value]);

  // The input follows the value when it changes from elsewhere.
  if (value !== shown) {
    setShown(value);
    setDraft(value ?? "");
  }

  const display = color ? formatColor(color, format, alpha) : null;
  const pickerLabel = labels.picker ?? "Pick a color";

  const commit = (next: string) => {
    if (next !== (value ?? "")) {
      onChange(next);
    }
  };

  const picker = (() => {
    if (format === "hsl") {
      const [h, s, l] = color ? toHsl(color) : [0, 0, 0];
      const pick = (next: { h: number; s: number; l: number; a?: number }) =>
        commit(
          formatColor(
            {
              space: "hsl",
              values: [next.h, next.s, next.l],
              alpha: next.a ?? 1,
              source: "hsl",
            },
            format,
            alpha,
          ),
        );
      return alpha ? (
        <HslaColorPicker
          color={{ h, s, l, a: color?.alpha ?? 1 }}
          onChange={pick}
        />
      ) : (
        <HslColorPicker color={{ h, s, l }} onChange={pick} />
      );
    }

    const [r, g, b] = color ? toRgb(color) : [0, 0, 0];
    const pick = (next: { r: number; g: number; b: number; a?: number }) =>
      commit(
        formatColor(
          {
            space: "rgb",
            values: [next.r, next.g, next.b],
            alpha: next.a ?? 1,
            source: "rgb",
          },
          format,
          alpha,
        ),
      );
    return alpha ? (
      <RgbaColorPicker
        color={{ r, g, b, a: color?.alpha ?? 1 }}
        onChange={pick}
      />
    ) : (
      <RgbColorPicker color={{ r, g, b }} onChange={pick} />
    );
  })();

  const content = (
    <PopoverContent
      className="flex w-auto flex-col gap-3 p-3"
      align="start"
      data-slot="color-picker-content"
    >
      <div className="[&_.react-colorful]:w-52 [&_.react-colorful]:h-44">
        {picker}
      </div>
      {swatches && swatches.length > 0 && (
        <div className="grid grid-cols-8 gap-1.5 w-52" role="group">
          {swatches.map((swatch) => {
            const normalized = normalizeColor(swatch, format, alpha);
            return (
              <button
                key={swatch}
                type="button"
                title={swatch}
                aria-label={swatch}
                aria-pressed={normalized !== null && normalized === display}
                disabled={normalized === null}
                className="cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => normalized && commit(normalized)}
              >
                <Swatch color={swatch} className="size-5" />
              </button>
            );
          })}
        </div>
      )}
      {clearable && value && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            commit("");
            setOpen(false);
          }}
        >
          {labels.clear ?? "Clear"}
        </Button>
      )}
    </PopoverContent>
  );

  if (!showInput) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-label={display ? `${pickerLabel}: ${display}` : pickerLabel}
          className={cn(
            "flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm select-none hover:border-ring data-[state=open]:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
            className,
          )}
        >
          <Swatch color={display} />
          {display ? (
            <span className="font-medium text-foreground">{display}</span>
          ) : (
            <span className="text-muted-foreground">
              {placeholder ?? pickerLabel}
            </span>
          )}
        </PopoverTrigger>
        {content}
      </Popover>
    );
  }

  return (
    <div
      data-slot="color-picker"
      className={cn(
        "flex h-9 items-center gap-2 rounded-md border bg-background pl-1.5 pr-3 focus-within:border-ring has-[[aria-invalid=true]]:border-destructive",
        disabled && "opacity-50",
        className,
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          aria-label={pickerLabel}
          className="flex size-7 cursor-pointer items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
        >
          <Swatch color={display} className="size-6" />
        </PopoverTrigger>
        {content}
      </Popover>
      <input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={labels.input}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        spellCheck={false}
        autoComplete="off"
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          // A typed color is converted to the format; anything else is
          // left for the server to report.
          const normalized = normalizeColor(draft, format, alpha);
          if (normalized !== null) {
            setDraft(normalized);
            commit(normalized);
          }
        }}
      />
    </div>
  );
}
