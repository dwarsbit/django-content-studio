import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiMagnifyingGlassBold, PiXBold } from "react-icons/pi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDiscover } from "@/hooks/use-discover";
import {
  DEFAULT_MAP_SETTINGS,
  formatCoordinate,
  locationOf,
  parseLatitude,
  parseLongitude,
  PIN_ZOOM,
  WORLD_CENTER,
  WORLD_ZOOM,
} from "@/lib/geo";
import type { MapHandle } from "@/lib/map/map";
import { cn } from "@/lib/utils";
import type {
  LatLng,
  MapSettings,
  MapWidgetOptions,
  ModelField,
  WidgetProps,
} from "@/types";

// The map's chunk, loaded once, on the first map field shown.
let mapModule: Promise<typeof import("@/lib/map/map")> | null = null;

function loadMap() {
  mapModule ??= import("@/lib/map/map");
  return mapModule;
}

type MapWidgetProps = {
  field?: ModelField;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
} & WidgetProps<unknown, MapWidgetOptions>;

/**
 * A location picked on a map: a click places the pin, dragging moves
 * it, the search box finds an address, and the boxes under the map
 * take the coordinates. A JSONField holds {lat, lng}; with the
 * lng_field option, the widget sits on the latitude number field and
 * fills the longitude field too.
 */
export function MapWidget(props: MapWidgetProps) {
  return props.options?.lng_field ? (
    <TwoFieldMap {...props} lngField={props.options.lng_field} />
  ) : (
    <JSONMap {...props} />
  );
}

function JSONMap({ value, onChange, ...props }: MapWidgetProps) {
  return (
    <LocationPicker
      {...props}
      location={locationOf(value)}
      onLocationChange={(next) => onChange(next)}
    />
  );
}

function TwoFieldMap({
  value,
  onChange,
  lngField,
  ...props
}: MapWidgetProps & { lngField: string }) {
  const form = useFormContext();
  const lng = useWatch({ name: lngField });
  const latitude = parseLatitude(value);
  const longitude = parseLongitude(lng);
  const location =
    latitude === null || longitude === null
      ? null
      : { lat: latitude, lng: longitude };

  return (
    <LocationPicker
      {...props}
      location={location}
      onLocationChange={(next) => {
        form.setValue(lngField, next ? next.lng : null, {
          shouldDirty: true,
          shouldValidate: true,
        });
        onChange(next ? next.lat : null);
      }}
    />
  );
}

interface GeocoderResult {
  lat: string;
  lon: string;
  display_name?: string;
}

function LocationPicker({
  field,
  options,
  location,
  onLocationChange,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: Omit<MapWidgetProps, "value" | "onChange"> & {
  location: LatLng | null;
  onLocationChange(location: LatLng | null): void;
}) {
  const { t, i18n } = useTranslation();
  const { data: discover } = useDiscover();
  const settings: MapSettings = discover?.map ?? DEFAULT_MAP_SETTINGS;
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  // The location as of the last render, for the effects.
  const locationRef = useRef(location);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // The boxes' text: typed text stays as typed until it is a
  // coordinate; a location from the map or outside refills them.
  const [text, setText] = useState({
    lat: formatCoordinate(location?.lat ?? null),
    lng: formatCoordinate(location?.lng ?? null),
  });
  const [reported, setReported] = useState(location);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
    locationRef.current = location;
  });

  const key = location ? `${location.lat},${location.lng}` : "";
  const reportedKey = reported ? `${reported.lat},${reported.lng}` : "";

  if (key !== reportedKey) {
    setReported(location);
    setText({
      lat: formatCoordinate(location?.lat ?? null),
      lng: formatCoordinate(location?.lng ?? null),
    });
  }

  function commit(next: LatLng | null) {
    setReported(next);
    onLocationChangeRef.current(next);
  }

  function keyOf(position: LatLng | null) {
    return position ? `${position.lat},${position.lng}` : "";
  }

  // The pin the map shows already, so a location the map itself set is
  // not pushed back to it (which would cut its animation short).
  const pinnedRef = useRef("");
  const center = options?.center;
  const centerKey = center ? `${center[0]},${center[1]}` : "";
  const zoom = options?.zoom ?? null;

  useEffect(() => {
    let cancelled = false;

    loadMap()
      .then(({ createMap }) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        pinnedRef.current = keyOf(locationRef.current);
        handleRef.current = createMap(containerRef.current, {
          tileUrl: settings.tile_url,
          attribution: settings.tile_attribution,
          position: locationRef.current,
          center: centerKey
            ? {
                lat: Number(centerKey.split(",")[0]),
                lng: Number(centerKey.split(",")[1]),
              }
            : WORLD_CENTER,
          zoom: zoom ?? (centerKey ? 10 : WORLD_ZOOM),
          pinZoom: PIN_ZOOM,
          onChange: (next) => {
            pinnedRef.current = keyOf(next);
            setText({
              lat: formatCoordinate(next.lat),
              lng: formatCoordinate(next.lng),
            });
            commit(next);
          },
        });
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
      setLoaded(false);
    };
    // The map is made again for other tiles or another start only;
    // the pin follows the location through the handle.
  }, [settings.tile_url, settings.tile_attribution, centerKey, zoom]);

  useEffect(() => {
    if (loaded && key !== pinnedRef.current) {
      pinnedRef.current = key;
      handleRef.current?.setPosition(locationRef.current);
    }
  }, [key, loaded]);

  function typed(part: "lat" | "lng", next: string) {
    const nextText = { ...text, [part]: next };
    const lat = parseLatitude(nextText.lat);
    const lng = parseLongitude(nextText.lng);

    setText(nextText);

    if (nextText.lat.trim() === "" && nextText.lng.trim() === "") {
      if (location) commit(null);
    } else if (lat !== null && lng !== null) {
      if (lat !== location?.lat || lng !== location?.lng) {
        commit({ lat, lng });
      }
    }
  }

  async function search() {
    const q = query.trim();

    if (!q || !settings.geocoder_url || searching) {
      return;
    }

    setSearching(true);
    setMessage(null);

    try {
      const params = new URLSearchParams({
        q,
        format: "json",
        limit: "1",
        "accept-language": i18n.language,
      });
      const response = await fetch(`${settings.geocoder_url}?${params}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Geocoder answered ${response.status}`);
      }

      const results = (await response.json()) as GeocoderResult[];
      const hit = Array.isArray(results) ? results[0] : undefined;
      const lat = parseLatitude(hit?.lat);
      const lng = parseLongitude(hit?.lon);

      if (lat === null || lng === null) {
        setMessage(t("widgets.map_widget.no_results", { query: q }));
        return;
      }

      const next = { lat, lng };

      pinnedRef.current = keyOf(next);
      setText({ lat: formatCoordinate(lat), lng: formatCoordinate(lng) });
      handleRef.current?.setPosition(next, true);
      commit(next);
    } catch {
      setMessage(t("widgets.map_widget.search_error"));
    } finally {
      setSearching(false);
    }
  }

  const latId = id ? `${id}` : undefined;
  const lngId = id ? `${id}-lng` : undefined;

  return (
    <div
      data-slot="map-widget"
      role="group"
      aria-label={field?.verbose_name}
      aria-describedby={ariaDescribedBy}
      className="space-y-2"
    >
      {settings.geocoder_url && !failed && (
        <div className="flex gap-2">
          <Input
            type="search"
            value={query}
            placeholder={t("widgets.map_widget.search_placeholder")}
            aria-label={t("widgets.map_widget.search")}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("widgets.map_widget.search")}
            title={t("widgets.map_widget.search")}
            disabled={searching || !query.trim()}
            onClick={() => void search()}
          >
            {searching ? <Spinner /> : <PiMagnifyingGlassBold />}
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {!failed && (
        <div
          className={cn(
            "dcs-map relative h-64 w-full overflow-hidden rounded-md border bg-muted",
            ariaInvalid && "border-destructive",
          )}
        >
          <div
            ref={containerRef}
            className="h-full w-full"
            aria-label={t("widgets.map_widget.map")}
          />
          {!loaded && (
            <div
              aria-busy="true"
              className="absolute inset-0 flex items-center justify-center"
            >
              <Spinner />
            </div>
          )}
        </div>
      )}
      {failed && (
        <p className="text-sm text-muted-foreground">
          {t("widgets.map_widget.load_error")}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("widgets.map_widget.latitude")}
          <Input
            id={latId}
            inputMode="decimal"
            autoComplete="off"
            value={text.lat}
            aria-invalid={ariaInvalid}
            onChange={(e) => typed("lat", e.target.value)}
            className="text-foreground"
          />
        </label>
        <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("widgets.map_widget.longitude")}
          <Input
            id={lngId}
            inputMode="decimal"
            autoComplete="off"
            value={text.lng}
            aria-invalid={ariaInvalid}
            onChange={(e) => typed("lng", e.target.value)}
            className="text-foreground"
          />
        </label>
        {location && !field?.required && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("common.clear")}
            title={t("common.clear")}
            onClick={() => {
              setText({ lat: "", lng: "" });
              commit(null);
            }}
          >
            <PiXBold />
          </Button>
        )}
      </div>
    </div>
  );
}
