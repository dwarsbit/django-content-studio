import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import {
  type AnalyticsExtension,
  type AnalyticsExtensionConfig,
  ExtensionType,
} from "@/types";

export type RangeKey = "today" | "7d" | "30d" | "90d" | "12mo" | "custom";

export const PRESETS: Exclude<RangeKey, "custom">[] = [
  "today",
  "7d",
  "30d",
  "90d",
  "12mo",
];

/** The period of a report: a preset, or custom dates (YYYY-MM-DD). */
export interface AnalyticsRange {
  key: RangeKey;
  start?: string;
  end?: string;
}

export type Interval = "hour" | "day" | "month";

interface ReportBase {
  range: { start: string; end: string; interval: Interval };
  path: string | null;
}

export interface MetricData {
  key: string;
  value: number;
  previous: number | null;
}

export interface SummaryData extends ReportBase {
  metrics: MetricData[];
  dashboard_url?: string | null;
}

export interface TimeseriesPoint {
  date: string;
  value: number;
  previous: number | null;
}

export interface TimeseriesData extends ReportBase {
  metric: string;
  points: TimeseriesPoint[];
}

export interface BreakdownRow {
  key: string;
  label: string | null;
  value: number;
  object: { model: string; id: string; title: string } | null;
}

export interface BreakdownData extends ReportBase {
  dimension: string;
  label: string;
  rows: BreakdownRow[];
}

/** The site's analytics, as the AnalyticsExtension describes them. */
export function useAnalyticsConfig(): AnalyticsExtensionConfig | null {
  const { data: discover } = useDiscover();
  const extension = discover?.extensions.find(
    (e): e is AnalyticsExtension =>
      e.extension_type === ExtensionType.AnalyticsExtension,
  );

  return extension?.config ?? null;
}

export function rangeParams(range: AnalyticsRange): Record<string, string> {
  return range.key === "custom" && range.start && range.end
    ? { range: "custom", start: range.start, end: range.end }
    : { range: range.key === "custom" ? "30d" : range.key };
}

/**
 * One part of a report (summary, timeseries, breakdown or realtime)
 * from a source: the analytics endpoint, or an Analytics component's.
 * The provider being down shows as an error, not as empty numbers.
 */
export function useReport<T>(
  source: string,
  params: Record<string, string | number | null | undefined>,
  options: { enabled?: boolean; refetchInterval?: number } = {},
) {
  const http = useHttp();
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value != null && value !== ""),
  );

  return useQuery<T | { path: null }, AxiosError>({
    enabled: options.enabled ?? true,
    retry: false,
    refetchInterval: options.refetchInterval,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryKey: ["analytics", source, clean],
    async queryFn() {
      const { data } = await http.get<T | { path: null }>(source, {
        params: clean,
      });

      return data;
    },
  });
}

/** Whether a component report says the object has no page. */
export function hasNoPath(data: unknown): data is { path: null } {
  return (
    typeof data === "object" &&
    data !== null &&
    Object.keys(data).length === 1 &&
    (data as { path?: unknown }).path === null
  );
}
