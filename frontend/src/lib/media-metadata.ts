import type { FocalPointValue, MediaMetadata, MediaProperties } from "@/types";

/** A JSON object field of an item, by attribute; null without. */
function objectOf(
  item: object | undefined,
  attr: string | null | undefined,
): Record<string, unknown> | null {
  const value = item && attr ? (item as Record<string, unknown>)[attr] : null;

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** An item's metadata under the configured attribute; null without. */
export function metadataOf(
  item: object | undefined,
  attr: string | null | undefined,
): MediaMetadata | null {
  return objectOf(item, attr) as MediaMetadata | null;
}

/** An item's properties under the configured attribute; null without. */
export function propertiesOf(
  item: object | undefined,
  attr: string | null | undefined,
): MediaProperties | null {
  return objectOf(item, attr) as MediaProperties | null;
}

/** An item's focal point, from its properties; null without one. */
export function focalPointOf(
  item: object | undefined,
  attr: string | null | undefined,
): FocalPointValue | null {
  return propertiesOf(item, attr)?.focal_point ?? null;
}

/**
 * The update that sets an item's focal point: its properties with the
 * new focal point, keeping the other properties.
 */
export function focalPointUpdate(
  item: object,
  attr: string,
  focalPoint: FocalPointValue | null,
): Record<string, MediaProperties> {
  return {
    [attr]: { ...propertiesOf(item, attr), focal_point: focalPoint },
  };
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** An image's or video's size from its metadata; null when unknown. */
export function dimensionsOf(
  metadata: MediaMetadata | null,
): { width: number; height: number } | null {
  return metadata && isNumber(metadata.width) && isNumber(metadata.height)
    ? { width: metadata.width, height: metadata.height }
    : null;
}

/** Seconds as "m:ss", or "h:mm:ss" from an hour. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const [h, m, s] = [
    Math.floor(total / 3600),
    Math.floor((total % 3600) / 60),
    total % 60,
  ];
  const pad = (n: number) => String(n).padStart(2, "0");

  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The metadata line: "1920 × 1080 px · 0:12 · 25 fps"; empty without. */
export function describeMetadata(metadata: MediaMetadata | null): string {
  const dimensions = dimensionsOf(metadata);

  return [
    dimensions && `${dimensions.width} × ${dimensions.height} px`,
    isNumber(metadata?.duration) && formatDuration(metadata.duration),
    isNumber(metadata?.frame_rate) && `${metadata.frame_rate} fps`,
  ]
    .filter(Boolean)
    .join(" · ");
}
