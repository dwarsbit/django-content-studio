import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  PiArrowClockwiseBold,
  PiArrowDownBold,
  PiArrowUpBold,
  PiChartLineBold,
  PiLinkBreakBold,
  PiWarningCircleBold,
} from "react-icons/pi";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { formatExactNumber, formatNumber } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import type { AnalyticsMetric } from "@/types";

import type { BreakdownRow, MetricData } from "./data";
import { change, exactMetric, formatMetric } from "./format";
import { rowLabel } from "./labels";

/** The change against the period before, colored by whether it is good. */
export function Trend({
  metric,
  data,
  pill = true,
}: {
  metric: AnalyticsMetric;
  data: MetricData;
  pill?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const pct = change(data.value, data.previous);

  if (!pct) return null;

  const good = pct * metric.sign > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums shrink-0",
        pill && "rounded-full px-1.5 py-0.5",
        good
          ? cn("text-success", pill && "bg-success/10")
          : cn("text-destructive", pill && "bg-destructive/10"),
      )}
      title={t("analytics.previous_value", {
        value: exactMetric(metric.kind, data.previous ?? 0, i18n?.language),
      })}
    >
      {pct < 0 ? (
        <PiArrowDownBold className="size-3" />
      ) : (
        <PiArrowUpBold className="size-3" />
      )}
      {`${formatNumber(Math.abs(pill ? pct : Math.round(pct)), { format: "full", locale: i18n?.language })}%`}
    </span>
  );
}

/** A metric as a tab over the chart: pick it to plot it. */
export function MetricTab({
  metric,
  data,
  active,
  onSelect,
}: {
  metric: AnalyticsMetric;
  data?: MetricData;
  active?: boolean;
  onSelect?(): void;
}) {
  const { i18n } = useTranslation();
  const Element = onSelect ? "button" : "div";

  return (
    <Element
      {...(onSelect
        ? { type: "button" as const, onClick: onSelect, "aria-pressed": active }
        : {})}
      className={cn(
        "text-left px-4 py-3.5 min-w-0 relative transition-colors",
        active ? "bg-card" : onSelect && "hover:bg-muted/40",
      )}
    >
      {active && (
        <span className="absolute inset-x-0 top-0 h-0.5 bg-foreground" />
      )}
      <div
        className={cn(
          "text-sm font-medium truncate",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {metric.label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2 whitespace-nowrap min-h-7">
        {data ? (
          <>
            <span
              className="text-2xl font-semibold tracking-tight tabular-nums leading-none"
              title={exactMetric(metric.kind, data.value, i18n?.language)}
            >
              {formatMetric(metric.kind, data.value, i18n?.language)}
            </span>
            <Trend metric={metric} data={data} />
          </>
        ) : (
          <span className="h-6 w-16 rounded bg-muted animate-pulse" />
        )}
      </div>
    </Element>
  );
}

/** A compact metric: label, value and trend. */
export function MiniMetric({
  metric,
  data,
}: {
  metric: AnalyticsMetric;
  data?: MetricData;
}) {
  const { i18n } = useTranslation();

  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground truncate">
        {metric.label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap min-h-6">
        {data ? (
          <>
            <span
              className="text-lg font-semibold tabular-nums leading-tight"
              title={exactMetric(metric.kind, data.value, i18n?.language)}
            >
              {formatMetric(metric.kind, data.value, i18n?.language)}
            </span>
            <Trend metric={metric} data={data} pill={false} />
          </>
        ) : (
          <span className="h-5 w-12 rounded bg-muted animate-pulse" />
        )}
      </div>
    </div>
  );
}

/** A breakdown as rows with a bar of their share of the largest. */
export function BreakdownList({
  dimension,
  rows,
  dense = false,
}: {
  dimension: string;
  rows: BreakdownRow[];
  dense?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className={cn("space-y-0.5", !dense && "px-2 pb-2")}>
      {rows.map((row) => {
        const { label, sub, icon } = rowLabel(
          dimension,
          row,
          t,
          i18n?.language,
        );
        const content = (
          <>
            <span
              aria-hidden
              className="absolute inset-y-0.5 left-0 rounded bg-foreground/[0.055]"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
            <span className="relative flex items-center gap-2 min-w-0 flex-1">
              {icon ? (
                <span className="text-muted-foreground shrink-0 flex [&_svg]:size-[15px]">
                  {icon}
                </span>
              ) : null}
              <span className="truncate">{label}</span>
              {sub && !dense ? (
                <span className="truncate text-xs text-muted-foreground">
                  {sub}
                </span>
              ) : null}
            </span>
            <span
              className="relative tabular-nums font-medium shrink-0"
              title={formatExactNumber(row.value, { locale: i18n?.language })}
            >
              {formatNumber(row.value, { locale: i18n?.language })}
            </span>
          </>
        );
        const className = cn(
          "relative flex items-center gap-3 rounded-md text-sm",
          dense ? "px-2 py-1" : "px-2.5 py-1.5",
        );

        return (
          <li key={row.key}>
            {row.object ? (
              <Link
                to={`/content/${row.object.model}/${row.object.id}`}
                className={cn(className, "hover:underline underline-offset-2")}
              >
                {content}
              </Link>
            ) : (
              <div className={className}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-card shadow-xs overflow-hidden min-w-0",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3 min-h-12">
        <h2 className="font-semibold flex-1 min-w-0 truncate">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Tabs as words in a card's header. */
export function WordTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  value: string;
  onChange(value: string): void;
}) {
  if (tabs.length < 2) return null;

  return (
    <div role="tablist" className="flex items-center gap-3 text-xs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "font-medium transition-colors",
            value === tab.key
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** The live visitor count. */
export function LiveVisitors({ count }: { count: number }) {
  const { t, i18n } = useTranslation();

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      <span>
        <span className="font-medium text-foreground tabular-nums">
          {formatNumber(count, { locale: i18n?.language })}
        </span>{" "}
        {t("analytics.online_now")}
      </span>
    </span>
  );
}

export function ReportMessage({
  kind,
  provider,
  onRetry,
  className,
}: {
  kind: "error" | "empty" | "no_path";
  provider?: string;
  onRetry?(): void;
  className?: string;
}) {
  const { t } = useTranslation();
  const icon =
    kind === "error" ? (
      <PiWarningCircleBold />
    ) : kind === "no_path" ? (
      <PiLinkBreakBold />
    ) : (
      <PiChartLineBold />
    );

  return (
    <div
      className={cn(
        "rounded-md border border-dashed px-3 py-5 text-sm text-muted-foreground flex flex-col items-center text-center gap-2",
        className,
      )}
    >
      <span className="[&_svg]:size-5">{icon}</span>
      <span>
        {kind === "error"
          ? t("analytics.error", {
              provider: provider ?? t("analytics.provider"),
            })
          : kind === "no_path"
            ? t("analytics.no_path")
            : t("analytics.empty")}
      </span>
      {kind === "error" && onRetry ? (
        <Button variant="outline" size="xs" onClick={onRetry}>
          <PiArrowClockwiseBold data-icon="inline-start" />
          {t("analytics.retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy className="px-4 pb-3 space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-5 rounded bg-muted animate-pulse"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  );
}
