/**
 * The map of MapWidget (Leaflet), loaded on demand by
 * components/widgets/map-widget.tsx: only pages with a map field
 * download it. Keep this module free of imports from the app, so its
 * chunk holds Leaflet alone and never imports the main bundle back.
 */
import L from "leaflet";
import leafletCss from "leaflet/dist/leaflet.css?inline";

// Mirrors LatLng in types.ts (not imported: see above).
export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapOptions {
  tileUrl: string;
  attribution: string;
  // The pin, or null for none.
  position: LatLng | null;
  // Where the map starts without a pin.
  center: LatLng;
  zoom: number;
  // The zoom the map shows a pin at.
  pinZoom: number;
  // Called when a click places the pin, or a drag moves it.
  onChange(position: LatLng): void;
}

export interface MapHandle {
  // Moves the pin, or removes it with null. fly animates the map to it;
  // otherwise the map only moves when the pin would be out of view.
  setPosition(position: LatLng | null, fly?: boolean): void;
  destroy(): void;
}

// Leaflet's own stylesheet, added to the page once. It travels inside
// this chunk, as a stylesheet of its own would be requested from a
// path Django does not serve.
let styles: HTMLStyleElement | null = null;

function ensureStyles() {
  if (styles || typeof document === "undefined") {
    return;
  }

  styles = document.createElement("style");
  styles.dataset.dcs = "leaflet";
  styles.textContent = leafletCss;
  document.head.appendChild(styles);
}

// The pin: an inline SVG colored by the theme, instead of Leaflet's
// marker images.
const PIN = L.divIcon({
  className: "dcs-map-pin",
  html:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 36" width="28" height="36" aria-hidden="true">' +
    '<path d="M14 1C7.4 1 2 6.3 2 12.9c0 8.6 10.4 20.3 11 20.9a1.3 1.3 0 0 0 2 0c.6-.6 11-12.3 11-20.9C26 6.3 20.6 1 14 1z" fill="currentColor" stroke="#fff" stroke-width="2"/>' +
    '<circle cx="14" cy="13" r="4.5" fill="#fff"/></svg>',
  iconSize: [28, 36],
  iconAnchor: [14, 35],
});

const DECIMALS = 6;

function round(latlng: L.LatLng): LatLng {
  // wrap() keeps the longitude in -180..180 after panning around the
  // world.
  const wrapped = latlng.wrap();

  return {
    lat: Number(wrapped.lat.toFixed(DECIMALS)),
    lng: Number(wrapped.lng.toFixed(DECIMALS)),
  };
}

export function createMap(
  container: HTMLElement,
  options: MapOptions,
): MapHandle {
  ensureStyles();

  const map = L.map(container, {
    // The ± buttons; the wheel and pinching zoom too.
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer(options.tileUrl, {
    attribution: options.attribution,
    maxZoom: 19,
  }).addTo(map);

  let marker: L.Marker | null = null;

  function place(position: LatLng) {
    if (marker) {
      marker.setLatLng(position);
      return;
    }

    marker = L.marker(position, {
      icon: PIN,
      draggable: true,
      // The map itself is reached with the keyboard; the boxes under
      // it edit the coordinates.
      keyboard: false,
    }).addTo(map);
    marker.on("dragend", () => {
      if (marker) {
        options.onChange(round(marker.getLatLng()));
      }
    });
  }

  map.on("click", (event: L.LeafletMouseEvent) => {
    const position = round(event.latlng);

    place(position);
    options.onChange(position);
  });

  if (options.position) {
    place(options.position);
    map.setView(options.position, options.pinZoom);
  } else {
    map.setView(options.center, options.zoom);
  }

  // A map that was laid out while hidden (a collapsed form set, a tab)
  // needs to measure itself again once it shows.
  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => map.invalidateSize());
  observer?.observe(container);

  return {
    setPosition(position, fly = false) {
      if (!position) {
        marker?.remove();
        marker = null;
        return;
      }

      place(position);

      if (fly) {
        map.flyTo(position, Math.max(map.getZoom(), options.pinZoom));
      } else if (!map.getBounds().contains(position)) {
        map.setView(position, map.getZoom());
      }
    },
    destroy() {
      observer?.disconnect();
      map.remove();
    },
  };
}
