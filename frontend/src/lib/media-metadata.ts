import type { MediaMetadata } from "@/types";

/** An item's metadata under the configured attribute; null without. */
export function metadataOf(
  item: object | undefined,
  attr: string | null | undefined,
): MediaMetadata | null {
  const value = item && attr ? (item as Record<string, unknown>)[attr] : null;

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MediaMetadata)
    : null;
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
