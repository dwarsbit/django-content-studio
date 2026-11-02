/**
 * Color parsing and formatting for the color picker. Mirrors
 * content_studio/colors.py: colors are read in the CSS hex, rgb() and
 * hsl() notations and written in one canonical form per format, so the
 * picker writes what the server saves.
 */

export type ColorFormat = "hex" | "rgb" | "hsl";

export const COLOR_FORMATS: readonly ColorFormat[] = ["hex", "rgb", "hsl"];

export interface Color {
  // rgb: channels 0-255; hsl: hue 0-360, saturation and lightness 0-100.
  space: "rgb" | "hsl";
  values: [number, number, number];
  // 0-1.
  alpha: number;
  // The notation it was written in.
  source: ColorFormat;
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTION = /^(rgba?|hsla?)\(([\s\S]*)\)$/i;
const ARGUMENT =
  /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg|grad|rad|turn)?$/i;

// Degrees per unit of a hue.
const HUE_UNITS: Record<string, number> = {
  "": 1,
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
};

function splitArguments(body: string): [string[], string | null] | null {
  body = body.trim();

  if (body.includes(",")) {
    const parts = body.split(",").map((part) => part.trim());
    if ((parts.length !== 3 && parts.length !== 4) || parts.some((p) => !p)) {
      return null;
    }
    return [parts.slice(0, 3), parts[3] ?? null];
  }

  let alpha: string | null = null;
  const slash = body.indexOf("/");
  if (slash !== -1) {
    alpha = body.slice(slash + 1).trim();
    body = body.slice(0, slash);
    if (!alpha || alpha.includes("/")) {
      return null;
    }
  }

  const parts = body.trim().split(/\s+/);
  return parts.length === 3 ? [parts, alpha] : null;
}

function parseArgument(value: string): [number, string] | null {
  const match = ARGUMENT.exec(value);
  return match ? [Number(match[1]), (match[2] ?? "").toLowerCase()] : null;
}

function parseAlpha(value: string | null): number | null {
  if (value === null) {
    return 1;
  }
  const parsed = parseArgument(value);
  if (!parsed) {
    return null;
  }
  let [number] = parsed;
  const [, unit] = parsed;
  if (unit === "%") {
    number /= 100;
  } else if (unit) {
    return null;
  }
  return number >= 0 && number <= 1 ? number : null;
}

/** The color value is, or null when it is not a hex, rgb or hsl color. */
export function parseColor(value: unknown): Color | null {
  if (typeof value !== "string") {
    return null;
  }
  value = value.trim();

  const hex = HEX.exec(value as string);
  if (hex) {
    let digits = hex[1].toLowerCase();
    if (digits.length <= 4) {
      digits = [...digits].map((digit) => digit + digit).join("");
    }
    const channel = (i: number) => parseInt(digits.slice(i, i + 2), 16);
    return {
      space: "rgb",
      values: [channel(0), channel(2), channel(4)],
      alpha: digits.length === 8 ? channel(6) / 255 : 1,
      source: "hex",
    };
  }

  const fn = FUNCTION.exec(value as string);
  if (!fn) {
    return null;
  }
  const space = fn[1].toLowerCase().slice(0, 3) as "rgb" | "hsl";
  const split = splitArguments(fn[2]);
  if (!split) {
    return null;
  }
  const alpha = parseAlpha(split[1]);
  const args = split[0].map(parseArgument);
  if (alpha === null || args.some((arg) => arg === null)) {
    return null;
  }
  const parsed = args as [number, string][];

  if (space === "rgb") {
    const channels: number[] = [];
    for (const [number, unit] of parsed) {
      if (unit && unit !== "%") {
        return null;
      }
      const channel = unit === "%" ? number * 2.55 : number;
      if (channel < 0 || channel > 255) {
        return null;
      }
      channels.push(channel);
    }
    return {
      space,
      values: channels as [number, number, number],
      alpha,
      source: "rgb",
    };
  }

  const [[hue, hueUnit], ...rest] = parsed;
  if (hueUnit === "%") {
    return null;
  }
  const h = (((hue * HUE_UNITS[hueUnit]) % 360) + 360) % 360;
  const percentages: number[] = [];
  for (const [number, unit] of rest) {
    if ((unit && unit !== "%") || number < 0 || number > 100) {
      return null;
    }
    percentages.push(number);
  }
  return {
    space,
    values: [h, percentages[0], percentages[1]],
    alpha,
    source: "hsl",
  };
}

export function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return [channel(0), channel(8), channel(4)];
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const l = (high + low) / 2;
  const d = high - low;
  if (d === 0) {
    return [0, 0, l * 100];
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (high === r) {
    h = ((((g - b) / d) % 6) + 6) % 6;
  } else if (high === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return [(h * 60) % 360, s * 100, l * 100];
}

/** A number rounded to places, without trailing zeros: 0.5, 210, 33.3. */
function formatNumber(value: number, places: number): string {
  const factor = 10 ** places;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** The color's red, green and blue channels, 0-255. */
export function toRgb(color: Color): [number, number, number] {
  return color.space === "hsl" ? hslToRgb(...color.values) : color.values;
}

/** The color's hue (0-360), saturation and lightness (0-100). */
export function toHsl(color: Color): [number, number, number] {
  return color.space === "hsl" ? color.values : rgbToHsl(...color.values);
}

/** The color in the canonical form of format, with alpha or not. */
export function formatColor(
  color: Color,
  format: ColorFormat,
  alpha: boolean,
): string {
  if (format === "hsl") {
    let [h] = toHsl(color);
    const [, s, l] = toHsl(color);
    // A hue that rounds to 360 is 0.
    if (Math.round(h * 10) / 10 >= 360) {
      h = 0;
    }
    const values = `${formatNumber(h, 1)}, ${formatNumber(s, 1)}%, ${formatNumber(l, 1)}%`;
    return alpha
      ? `hsla(${values}, ${formatNumber(color.alpha, 3)})`
      : `hsl(${values})`;
  }

  const [r, g, b] = toRgb(color).map((channel) =>
    Math.min(255, Math.max(0, Math.round(channel))),
  );

  if (format === "hex") {
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    const text = `#${hex(r)}${hex(g)}${hex(b)}`;
    return alpha ? `${text}${hex(Math.round(color.alpha * 255))}` : text;
  }

  return alpha
    ? `rgba(${r}, ${g}, ${b}, ${formatNumber(color.alpha, 3)})`
    : `rgb(${r}, ${g}, ${b})`;
}

/**
 * value in the canonical form of format, or null when it is not a
 * color, or is translucent while alpha is off.
 */
export function normalizeColor(
  value: unknown,
  format: ColorFormat,
  alpha: boolean,
): string | null {
  const color = parseColor(value);
  if (!color || (!alpha && color.alpha < 1)) {
    return null;
  }
  return formatColor(color, format, alpha);
}
