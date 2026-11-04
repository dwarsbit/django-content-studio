import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { Interval, TimeseriesPoint } from "./data";
import { formatBucket } from "./format";

/** A round top for the axis: four gridline steps of 1, 2, 2.5 or 5. */
export function niceMax(value: number) {
  const raw = value / 4;
  if (raw <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((s) => raw / pow <= s) ?? 10;
  return step * pow * 4;
}

/**
 * One metric over time: the period as a line over a soft area, the
 * period before as a dashed line behind it, with a crosshair and a
 * tooltip on hover. compact draws the line alone, as a sparkline.
 */
export function TimeChart({
  points,
  interval,
  label,
  format,
  height = 240,
  compact = false,
}: {
  points: TimeseriesPoint[];
  interval: Interval;
  label: string;
  format(value: number): string;
  height?: number;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const dates = useMemo(() => points.map((p) => new Date(p.date)), [points]);
  const hasPrevious = !compact && points.some((p) => p.previous != null);
  const left = compact ? 0 : 44;
  const bottom = compact ? 2 : 24;
  const top = compact ? 2 : 8;
  const w = Math.max(width - left, 10);
  const h = Math.max(height - bottom - top, 10);
  const peak = Math.max(
    0,
    ...points.map((p) =>
      hasPrevious ? Math.max(p.value, p.previous ?? 0) : p.value,
    ),
  );
  const max = compact ? peak * 1.1 || 1 : niceMax(peak * 1.05);
  const last = Math.max(points.length - 1, 1);
  const x = (i: number) => left + (i / last) * w;
  const y = (v: number) => top + h - (v / max) * h;
  const line = (values: number[]) =>
    values
      .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join("");
  const current = line(points.map((p) => p.value));
  const previous = hasPrevious ? line(points.map((p) => p.previous ?? 0)) : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => step * max);
  const labelEvery = Math.max(
    1,
    Math.ceil(points.length / Math.max(2, Math.floor(w / 90))),
  );
  const active = hover != null ? points[hover] : null;

  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        className="block overflow-visible"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          if (compact || points.length < 2) return;
          const box = event.currentTarget.getBoundingClientRect();
          const i = Math.round(((event.clientX - box.left - left) / w) * last);
          setHover(Math.min(points.length - 1, Math.max(0, i)));
        }}
      >
        {!compact &&
          ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={left + w}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border"
                strokeDasharray={tick ? "2 3" : undefined}
              />
              <text
                x={left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {format(tick)}
              </text>
            </g>
          ))}
        {!compact &&
          dates.map((date, i) =>
            i % labelEvery === 0 ? (
              <text
                key={i}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : "middle"}
                className="fill-muted-foreground text-[11px]"
              >
                {formatBucket(date, interval, i18n?.language)}
              </text>
            ) : null,
          )}
        {previous && (
          <path
            d={previous}
            fill="none"
            className="stroke-muted-foreground/50"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}
        {points.length > 1 && (
          <>
            <path
              d={`${current}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`}
              className="fill-foreground/[0.07]"
            />
            <path
              d={current}
              fill="none"
              className="stroke-foreground"
              strokeWidth={compact ? 1.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
        {active && hover != null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={top}
              y2={top + h}
              className="stroke-foreground/30"
            />
            <circle
              cx={x(hover)}
              cy={y(active.value)}
              r={4.5}
              className="fill-foreground stroke-card"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      {active && hover != null && (
        <div
          role="tooltip"
          className="absolute pointer-events-none rounded-md border bg-popover shadow-md px-3 py-2 text-xs w-48"
          style={{
            left: x(hover) + 204 > width ? x(hover) - 204 : x(hover) + 12,
            top: 4,
          }}
        >
          <div className="font-medium mb-1.5">
            {formatBucket(dates[hover], interval, i18n?.language, true)}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 rounded bg-foreground shrink-0" />
            <span className="text-muted-foreground flex-1 truncate">
              {label}
            </span>
            <span className="font-semibold tabular-nums">
              {format(active.value)}
            </span>
          </div>
          {active.previous != null && (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-3 border-t-[1.5px] border-dashed border-muted-foreground/60 shrink-0" />
              <span className="text-muted-foreground flex-1 truncate">
                {t("analytics.previous_period")}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {format(active.previous)}
              </span>
            </div>
          )}
        </div>
      )}
      {!compact && (
        <table className="sr-only">
          <caption>{label}</caption>
          <tbody>
            {points.map((point, i) => (
              <tr key={point.date}>
                <th scope="row">
                  {formatBucket(dates[i], interval, i18n?.language, true)}
                </th>
                <td>{format(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The chart's legend: this period and, when shown, the one before. */
export function ChartLegend({
  label,
  previous = true,
  className,
}: {
  label: string;
  previous?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex items-center gap-4 text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="w-3.5 h-0.5 rounded bg-foreground" />
        {label}
      </span>
      {previous && (
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-[1.5px] border-dashed border-muted-foreground/60" />
          {t("analytics.previous_period")}
        </span>
      )}
    </div>
  );
}
