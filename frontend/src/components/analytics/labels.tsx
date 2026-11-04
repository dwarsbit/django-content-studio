import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import {
  PiArrowSquareInBold,
  PiDesktopBold,
  PiDeviceMobileBold,
  PiDeviceTabletBold,
  PiGlobeBold,
  PiLaptopBold,
} from "react-icons/pi";

import type { BreakdownRow } from "./data";

const DEVICE_ICONS: Record<string, ReactNode> = {
  desktop: <PiDesktopBold />,
  laptop: <PiLaptopBold />,
  mobile: <PiDeviceMobileBold />,
  tablet: <PiDeviceTabletBold />,
};

const BROWSERS: Record<string, string> = {
  chrome: "Chrome",
  crios: "Chrome (iOS)",
  safari: "Safari",
  ios: "Safari (iOS)",
  "ios-webview": "Safari (iOS)",
  firefox: "Firefox",
  fxios: "Firefox (iOS)",
  edge: "Edge",
  "edge-chromium": "Edge",
  "edge-ios": "Edge (iOS)",
  opera: "Opera",
  samsung: "Samsung Internet",
  "chromium-webview": "Android WebView",
  android: "Android browser",
  yandexbrowser: "Yandex",
  brave: "Brave",
  ie: "Internet Explorer",
};

/** "organicSearch" or "paid_social" as "Organic search", "Paid social". */
export function humanize(value: string) {
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A two-letter country code as its flag. */
export function flag(code: string) {
  if (!/^[A-Za-z]{2}$/.test(code)) return null;

  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

function countryName(code: string, locale?: string) {
  try {
    return (
      new Intl.DisplayNames(locale ? [locale] : undefined, {
        type: "region",
      }).of(code.toUpperCase()) ?? code
    );
  } catch {
    return code;
  }
}

export interface RowLabel {
  label: string;
  sub?: string;
  icon?: ReactNode;
}

/**
 * How a breakdown row reads: countries by name with their flag, devices
 * and channels in the editor's language, browsers by their product
 * name, pages by the object they show. A label from the provider wins.
 */
export function rowLabel(
  dimension: string,
  row: BreakdownRow,
  t: TFunction,
  locale?: string,
): RowLabel {
  const key = row.key ?? "";

  switch (dimension) {
    case "pages":
    case "entry_pages":
    case "exit_pages":
      return row.object
        ? { label: row.object.title, sub: key }
        : { label: row.label || key || "/" };
    case "countries": {
      const icon = flag(key);
      return {
        label:
          row.label ||
          (key ? countryName(key, locale) : t("analytics.unknown")),
        icon: icon ? (
          <span className="text-[14px] leading-none">{icon}</span>
        ) : undefined,
      };
    }
    case "regions": {
      const icon = flag(key.slice(0, 2));
      return {
        label: row.label || key || t("analytics.unknown"),
        icon: icon ? (
          <span className="text-[14px] leading-none">{icon}</span>
        ) : undefined,
      };
    }
    case "devices":
      return {
        label:
          row.label ||
          (key
            ? t(`analytics.devices.${key}`, { defaultValue: humanize(key) })
            : t("analytics.unknown")),
        icon: DEVICE_ICONS[key],
      };
    case "browsers":
      return {
        label:
          row.label ||
          BROWSERS[key] ||
          (key ? humanize(key) : t("analytics.unknown")),
      };
    case "referrers":
      return key
        ? { label: row.label || key, icon: <PiGlobeBold /> }
        : { label: t("analytics.direct"), icon: <PiArrowSquareInBold /> };
    case "channels":
      return {
        label:
          row.label ||
          t(`analytics.channels.${key}`, {
            defaultValue: humanize(key || "direct"),
          }),
      };
    default:
      return { label: row.label || key || t("analytics.none") };
  }
}
