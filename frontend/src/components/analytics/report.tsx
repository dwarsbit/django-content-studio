import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatNumber } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import type { AnalyticsExtensionConfig } from "@/types";

import { ChartLegend, TimeChart } from "./chart";
import {
  type AnalyticsRange,
  type BreakdownData,
  hasNoPath,
  rangeParams,
  type SummaryData,
  type TimeseriesData,
  useReport,
} from "./data";
import { formatMetric } from "./format";
import {
  BreakdownList,
  Card,
  MetricTab,
  ReportMessage,
  RowsSkeleton,
  WordTabs,
} from "./parts";

/** The breakdown cards, each with its breakdowns as tabs. */
export const BREAKDOWN_GROUPS = [
  { key: "pages", dimensions: ["pages", "entry_pages", "exit_pages"] },
  { key: "sources", dimensions: ["referrers", "channels", "campaigns"] },
  { key: "locations", dimensions: ["countries", "regions", "cities"] },
  { key: "devices", dimensions: ["devices", "browsers", "os"] },
];

/** The metrics as tabs over a chart of the picked one. */
export function Overview({
  source,
  range,
  config,
  summary,
  className,
  chartHeight = 260,
  extraParams = {},
}: {
  source: string;
  range: AnalyticsRange;
  config: AnalyticsExtensionConfig;
  summary?: SummaryData;
  className?: string;
  chartHeight?: number;
  extraParams?: Record<string, string | null>;
}) {
  const { t, i18n } = useTranslation();
  const charted = config.metrics.filter((m) =>
    config.timeseries_metrics.includes(m.key),
  );
  const [selected, setSelected] = useState(charted[0]?.key ?? null);
  const metric = config.metrics.find((m) => m.key === selected) ?? charted[0];
  const timeseries = useReport<TimeseriesData>(
    source,
    {
      part: "timeseries",
      metric: metric?.key,
      ...extraParams,
      ...rangeParams(range),
    },
    { enabled: Boolean(metric) },
  );
  const series =
    timeseries.data && !hasNoPath(timeseries.data) ? timeseries.data : null;

  return (
    <section
      className={cn(
        "rounded-lg border bg-card shadow-xs overflow-hidden",
        className,
      )}
    >
      <div
        className="grid divide-x border-b bg-muted/30 max-sm:!grid-cols-2 max-sm:divide-y"
        style={{
          gridTemplateColumns: `repeat(${config.metrics.length}, minmax(0, 1fr))`,
        }}
      >
        {config.metrics.map((m) => (
          <MetricTab
            key={m.key}
            metric={m}
            data={summary?.metrics.find((d) => d.key === m.key)}
            active={m.key === metric?.key}
            onSelect={
              config.timeseries_metrics.includes(m.key)
                ? () => setSelected(m.key)
                : undefined
            }
          />
        ))}
      </div>
      {metric && (
        <div className="px-4 pt-3 pb-4">
          <ChartLegend
            label={metric.label}
            previous={Boolean(series?.points.some((p) => p.previous != null))}
            className="justify-end mb-2"
          />
          {timeseries.isError ? (
            <ReportMessage
              kind="error"
              provider={config.provider}
              onRetry={() => timeseries.refetch()}
            />
          ) : series ? (
            <TimeChart
              points={series.points}
              interval={series.range.interval}
              label={metric.label}
              height={chartHeight}
              format={(value) =>
                metric.kind === "number"
                  ? formatNumber(value, { locale: i18n?.language })
                  : formatMetric(metric.kind, value, i18n?.language)
              }
            />
          ) : (
            <div
              aria-busy
              aria-label={t("analytics.loading")}
              className="rounded-md bg-muted/50 animate-pulse"
              style={{ height: chartHeight }}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** One group of breakdowns (pages, sources, locations or devices). */
export function BreakdownCard({
  source,
  range,
  config,
  group,
  limit = 10,
  className,
  extraParams = {},
}: {
  source: string;
  range: AnalyticsRange;
  config: AnalyticsExtensionConfig;
  group: (typeof BREAKDOWN_GROUPS)[number];
  limit?: number;
  className?: string;
  extraParams?: Record<string, string | null>;
}) {
  const { t } = useTranslation();
  const dimensions = group.dimensions.filter((d) =>
    config.breakdowns.includes(d),
  );
  const [dimension, setDimension] = useState(dimensions[0]);
  const report = useReport<BreakdownData>(
    source,
    {
      part: "breakdown",
      dimension,
      limit,
      ...extraParams,
      ...rangeParams(range),
    },
    { enabled: Boolean(dimension) },
  );

  if (!dimension) return null;

  const data = report.data && !hasNoPath(report.data) ? report.data : null;

  return (
    <Card
      title={t(`analytics.cards.${group.key}`)}
      className={className}
      action={
        <WordTabs
          tabs={dimensions.map((key) => ({
            key,
            label: t(`analytics.breakdowns.${key}`),
          }))}
          value={dimension}
          onChange={setDimension}
        />
      }
    >
      {report.isError ? (
        <div className="px-4 pb-4">
          <ReportMessage
            kind="error"
            provider={config.provider}
            onRetry={() => report.refetch()}
          />
        </div>
      ) : !data ? (
        <RowsSkeleton />
      ) : data.rows.length === 0 ? (
        <div className="px-4 pb-4 text-sm text-muted-foreground">
          {t("analytics.no_data")}
        </div>
      ) : (
        <>
          <div className="flex justify-end px-4 pb-1.5 text-xs text-muted-foreground">
            {t("analytics.visitors")}
          </div>
          <BreakdownList dimension={dimension} rows={data.rows} />
        </>
      )}
    </Card>
  );
}
