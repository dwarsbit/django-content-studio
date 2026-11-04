import { useContext, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PiArrowRightBold } from "react-icons/pi";
import { Link } from "react-router";

import { TimeChart } from "@/components/analytics/chart";
import {
  type AnalyticsRange,
  type BreakdownData,
  hasNoPath,
  PRESETS,
  type RangeKey,
  rangeParams,
  type SummaryData,
  type TimeseriesData,
  useAnalyticsConfig,
  useReport,
} from "@/components/analytics/data";
import {
  BreakdownList,
  MiniMetric,
  ReportMessage,
  RowsSkeleton,
} from "@/components/analytics/parts";
import { RangeSelect } from "@/components/analytics/range-select";
import {
  BREAKDOWN_GROUPS,
  BreakdownCard,
  Overview,
} from "@/components/analytics/report";
import { EditPlacementContext } from "@/components/content-editor/edit-placement";
import { ResourcePathContext } from "@/components/content-editor/resource-path";
import { Button } from "@/components/ui/button";
import type { AnalyticsExtensionConfig, FormField, Model } from "@/types";

function initialRange(formField: FormField): AnalyticsRange {
  const key = formField.default_range as RangeKey | undefined;

  return { key: key && (PRESETS as string[]).includes(key) ? key : "30d" };
}

/** A link to the analytics page, filtered to the object's page. */
function reportLink(
  config: AnalyticsExtensionConfig,
  path: string,
  range: AnalyticsRange,
) {
  if (!config.page_path) return null;
  const params = new URLSearchParams({ path, ...rangeParams(range) });

  return `/${config.page_path.replace(/^\/+|\/+$/g, "")}/?${params}`;
}

/**
 * The Analytics component: visits to the edited object's page. Compact
 * in the sidebar (four numbers, a sparkline, the top sources), the full
 * report in the main column; the component's layout can force one.
 * Hidden on the create form and without analytics.
 */
export function Analytics({
  model,
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const config = useAnalyticsConfig();
  const placement = useContext(EditPlacementContext);
  const form = useFormContext();
  const id = form.watch("id");
  const resourcePath =
    useContext(ResourcePathContext) ?? `/content/${model.label}`;
  const source = `${resourcePath}${model.admin.is_singleton ? "" : `/${id}`}/components/${formField.component_id}`;
  const layout =
    formField.layout && formField.layout !== "auto"
      ? formField.layout
      : placement === "sidebar"
        ? "compact"
        : "full";

  if (id == null || !config) return null;

  return layout === "compact" ? (
    <CompactAnalytics source={source} config={config} formField={formField} />
  ) : (
    <FullAnalytics source={source} config={config} formField={formField} />
  );
}

function CompactAnalytics({
  source,
  config,
  formField,
}: {
  source: string;
  config: AnalyticsExtensionConfig;
  formField: FormField;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState(() => initialRange(formField));
  const summary = useReport<SummaryData>(source, {
    part: "summary",
    ...rangeParams(range),
  });
  const sparkMetric = config.timeseries_metrics[0];
  const timeseries = useReport<TimeseriesData>(
    source,
    { part: "timeseries", metric: sparkMetric, ...rangeParams(range) },
    {
      enabled:
        Boolean(sparkMetric) &&
        Boolean(summary.data) &&
        !hasNoPath(summary.data),
    },
  );
  const sources = config.breakdowns.includes("referrers") ? "referrers" : null;
  const breakdown = useReport<BreakdownData>(
    source,
    { part: "breakdown", dimension: sources, limit: 3, ...rangeParams(range) },
    {
      enabled:
        Boolean(sources) && Boolean(summary.data) && !hasNoPath(summary.data),
    },
  );
  const noPath = hasNoPath(summary.data);
  const data =
    summary.data && !noPath ? (summary.data as SummaryData) : undefined;
  const series =
    timeseries.data && !hasNoPath(timeseries.data) ? timeseries.data : null;
  const rows =
    breakdown.data && !hasNoPath(breakdown.data) ? breakdown.data.rows : null;
  const metrics = config.metrics.filter((m) => m.key !== "visits").slice(0, 4);
  const empty = data && data.metrics.every((m) => !m.value);
  const link = data?.path ? reportLink(config, data.path, range) : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <h2 className="font-semibold flex-1 truncate">{formField.title}</h2>
        {!noPath && !summary.isError && (
          <RangeSelect value={range} onChange={setRange} size="sm" />
        )}
      </div>
      {summary.isError ? (
        <ReportMessage
          kind="error"
          provider={config.provider}
          onRetry={() => summary.refetch()}
        />
      ) : noPath ? (
        <ReportMessage kind="no_path" />
      ) : empty ? (
        <ReportMessage kind="empty" />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {metrics.map((m) => (
              <MiniMetric
                key={m.key}
                metric={m}
                data={data?.metrics.find((d) => d.key === m.key)}
              />
            ))}
          </div>
          {sparkMetric &&
            (series ? (
              <TimeChart
                points={series.points}
                interval={series.range.interval}
                label={
                  config.metrics.find((m) => m.key === sparkMetric)?.label ??
                  sparkMetric
                }
                height={48}
                compact
                format={String}
              />
            ) : (
              <div className="h-12 rounded bg-muted/50 animate-pulse" />
            ))}
          {sources && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                {t("analytics.top_sources")}
              </div>
              {rows ? (
                rows.length ? (
                  <BreakdownList dimension={sources} rows={rows} dense />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {t("analytics.no_data")}
                  </div>
                )
              ) : (
                <RowsSkeleton rows={3} />
              )}
            </div>
          )}
          {link && (
            <Link
              to={link}
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t("analytics.full_report")}
              <PiArrowRightBold className="size-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function FullAnalytics({
  source,
  config,
  formField,
}: {
  source: string;
  config: AnalyticsExtensionConfig;
  formField: FormField;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState(() => initialRange(formField));
  const summary = useReport<SummaryData>(source, {
    part: "summary",
    ...rangeParams(range),
  });
  const noPath = hasNoPath(summary.data);
  const data =
    summary.data && !noPath ? (summary.data as SummaryData) : undefined;
  const link = data?.path ? reportLink(config, data.path, range) : null;
  const groups = BREAKDOWN_GROUPS.filter(
    (g) => g.key === "sources" || g.key === "locations",
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">{formField.title}</h2>
          {data?.path && (
            <div className="text-sm text-muted-foreground truncate">
              {t("analytics.visits_to")}{" "}
              <span className="font-mono text-[13px]">{data.path}</span>
              {" · "}
              {config.provider}
            </div>
          )}
        </div>
        {!noPath && !summary.isError && (
          <RangeSelect value={range} onChange={setRange} />
        )}
        {link && (
          <Button variant="outline" asChild>
            <Link to={link}>
              {t("analytics.full_report")}
              <PiArrowRightBold data-icon="inline-end" />
            </Link>
          </Button>
        )}
      </div>
      {summary.isError ? (
        <ReportMessage
          kind="error"
          provider={config.provider}
          onRetry={() => summary.refetch()}
        />
      ) : noPath ? (
        <ReportMessage kind="no_path" />
      ) : (
        <div key={JSON.stringify(range)} className="space-y-5">
          <Overview
            source={source}
            range={range}
            config={config}
            summary={data}
            chartHeight={220}
            className="shadow-none"
          />
          <div className="grid gap-5 lg:grid-cols-2">
            {groups.map((group) => (
              <BreakdownCard
                key={group.key}
                source={source}
                range={range}
                config={config}
                group={group}
                limit={5}
                className="shadow-none"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
