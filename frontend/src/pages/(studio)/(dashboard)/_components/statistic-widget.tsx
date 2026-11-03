import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PiArrowDownBold, PiArrowUpBold } from "react-icons/pi";

import { useHttp } from "@/hooks/use-http";
import {
  formatExactNumber,
  formatNumber,
  type NumberFormat,
} from "@/lib/format-number";
import { cn } from "@/lib/utils";
import { type DashboardWidget } from "@/types";

import { widgetRefetchInterval } from "./refresh";

export interface StatisticWidgetData {
  title: string;
  value: number;
  suffix?: string;
  prefix?: string;
  trend?: string | number | null;
  trend_sentiment?: "default" | "positive" | "negative";
  trend_label?: string;
  number_format?: NumberFormat;
  currency?: string;
  icon?: string;
  footnote?: string;
  series?: number[];
  max_value?: number | null;
}

/**
 * One number with its title, in the editor's language and compact by
 * default (45.9K; the exact value on hover). Optionally an icon, the
 * trend as a pill colored by its sentiment, a footnote, a sparkline of
 * `series` and a meter of the value against `max_value`.
 */
export function StatisticWidget({ widget }: { widget: DashboardWidget }) {
  const http = useHttp();
  const { i18n } = useTranslation();
  const { data } = useQuery({
    retry: false,
    refetchInterval: widgetRefetchInterval(widget),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryKey: ["dashboard", "widg", widget.widget_id],
    async queryFn() {
      const { data } = await http.get<StatisticWidgetData>(
        `/dashboard/widgets/${widget.widget_id}`,
      );

      return data;
    },
  });

  if (!data) {
    return (
      <section
        aria-busy
        className="rounded-lg border bg-card shadow-xs p-4 space-y-3 min-h-[104px]"
      >
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
        <div className="h-7 w-20 rounded bg-muted animate-pulse" />
      </section>
    );
  }

  const value = Number(data.value);
  const options = {
    format: data.number_format,
    currency: data.currency || undefined,
    locale: i18n?.language,
  };
  const shown = formatNumber(value, options);
  const exact = `${data.prefix ?? ""}${formatExactNumber(value, options)}${data.suffix ?? ""}`;
  const trend = data.trend != null ? Number(data.trend) : NaN;
  const hasTrend = Number.isFinite(trend) && trend !== 0;
  const footnote = [hasTrend ? data.trend_label : "", data.footnote]
    .filter(Boolean)
    .join(" · ");
  const series = (data.series ?? []).map(Number).filter(Number.isFinite);
  const max = data.max_value != null ? Number(data.max_value) : NaN;

  return (
    <section className="h-full rounded-lg border bg-card shadow-xs p-4 flex flex-col gap-2.5 min-h-[104px]">
      <div className="flex items-center gap-2 min-w-0 text-sm font-medium text-muted-foreground">
        {data.icon ? (
          <span
            aria-hidden
            className="size-6 shrink-0 rounded-md bg-accent text-foreground flex items-center justify-center"
          >
            <span className={cn(data.icon, "text-[14px]")} />
          </span>
        ) : null}
        <span className="truncate">{data.title}</span>
      </div>
      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
        <div
          className="text-3xl font-semibold tracking-tight tabular-nums leading-none"
          title={exact}
        >
          <span aria-hidden>
            {data.prefix}
            {shown}
            {data.suffix}
          </span>
          <span className="sr-only">{exact}</span>
        </div>
        {hasTrend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums shrink-0",
              {
                "text-success bg-success/10":
                  data.trend_sentiment === "positive",
                "text-destructive bg-destructive/10":
                  data.trend_sentiment === "negative",
                "text-muted-foreground bg-accent":
                  !data.trend_sentiment || data.trend_sentiment === "default",
              },
            )}
          >
            {trend < 0 ? (
              <PiArrowDownBold className="size-3" />
            ) : (
              <PiArrowUpBold className="size-3" />
            )}
            {`${formatNumber(Math.abs(trend), { format: "full", locale: i18n?.language })}%`}
          </span>
        )}
      </div>
      {footnote ? (
        <div className="text-xs text-muted-foreground truncate">{footnote}</div>
      ) : null}
      {series.length > 1 ? (
        <div className="mt-auto">
          <Sparkline values={series} />
        </div>
      ) : Number.isFinite(max) && max > 0 ? (
        <div
          role="meter"
          aria-label={data.title}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          className="mt-auto h-1.5 rounded-full bg-accent overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-foreground/70"
            style={{
              width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`,
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

/** A small line chart of the values, oldest first, with a soft area. */
export function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const step = 100 / (values.length - 1);
  const points = values.map(
    (v, i) =>
      `${(i * step).toFixed(2)},${(30 - ((v - min) / range) * 28).toFixed(2)}`,
  );
  const line = `M${points.join("L")}`;

  return (
    <svg
      data-slot="sparkline"
      aria-hidden
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className="block w-full h-9 text-foreground/60"
    >
      <path d={`${line}L100,32L0,32Z`} fill="currentColor" opacity={0.08} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
