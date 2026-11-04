import type { LatLng } from "@/types";

// The map tiles and search when the server does not say (an older
// server, the UI showcase).
export const DEFAULT_MAP_SETTINGS = {
  tile_url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tile_attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  geocoder_url: "https://nominatim.openstreetmap.org/search",
};

// Where the map starts without a pin and without a center option: the
// world, roughly centered on the prime meridian.
export const WORLD_CENTER: LatLng = { lat: 20, lng: 0 };
export const WORLD_ZOOM = 2;
// The zoom the map shows a pin at: a neighborhood.
export const PIN_ZOOM = 15;
// Decimals coordinates are kept with: about 10 cm.
const DECIMALS = 6;

/** A coordinate typed or stored as a number or string, or null. */
export function parseCoordinate(value: unknown, limit: number): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value.trim().replace(",", "."))
        : NaN;

  if (!Number.isFinite(number) || Math.abs(number) > limit) {
    return null;
  }

  return roundCoordinate(number);
}

export function roundCoordinate(value: number): number {
  return Number(value.toFixed(DECIMALS));
}

export function parseLatitude(value: unknown): number | null {
  return parseCoordinate(value, 90);
}

export function parseLongitude(value: unknown): number | null {
  return parseCoordinate(value, 180);
}

/** The location a JSONField holds: {lat, lng}, or null for anything else. */
export function locationOf(value: unknown): LatLng | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const { lat, lng } = value as Record<string, unknown>;
  const latitude = parseLatitude(lat);
  const longitude = parseLongitude(lng);

  return latitude === null || longitude === null
    ? null
    : { lat: latitude, lng: longitude };
}

/** A coordinate as text for its box: without trailing zeros. */
export function formatCoordinate(value: number | null): string {
  return value === null ? "" : String(roundCoordinate(value));
}
