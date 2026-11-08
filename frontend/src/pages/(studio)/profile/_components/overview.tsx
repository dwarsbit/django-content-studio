import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import * as R from "ramda";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ChartLegend, TimeChart } from "@/components/analytics/chart";
import type { AnalyticsRange } from "@/components/analytics/data";
import {
  BreakdownList,
  Card,
  MetricTab,
  RowsSkeleton,
} from "@/components/analytics/parts";
import { Badge } from "@/components/ui/badge";
import { useDiscover } from "@/hooks/use-discover";
import {
  type ProfileMetric,
  type RecentItem,
  useProfileActivity,
  useRecentContent,
} from "@/hooks/use-profile";
import { formatNumber } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import type { AnalyticsMetric } from "@/types";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

const METRICS: ProfileMetric[] = ["total", "created", "updated", "deleted"];

const ACTION_TONES = {
  created: "green",
  updated: "blue",
  deleted: "red",
} as const;

/** The overview tab: the user's changes, recent content, by model. */
export function ProfileOverview({ range }: { range: AnalyticsRange }) {
  return (
    <>
      <ActivityCard range={range} />
      <div className="grid gap-5 md:grid-cols-3 items-start">
        <RecentContentCard className="md:col-span-2" />
        <ByModelCard range={range} />
      </div>
    </>
  );
}

/** The metrics as tabs over a chart of the picked one. */
function ActivityCard({ range }: { range: AnalyticsRange }) {
  const { t, i18n } = useTranslation();
  const { data, isError } = useProfileActivity(range);
  const [selected, setSelected] = useState<ProfileMetric>("total");
  const metrics: AnalyticsMetric[] = METRICS.map((key) => ({
    key,
    label: t(`profile.metrics.${key}`),
    kind: "number",
    sign: 1,
  }));
  const metric = metrics.find((m) => m.key === selected)!;
  const points = data?.series[selected];
  const chartHeight = 220;

  return (
    <section className="rounded-lg border bg-card shadow-xs overflow-hidden">
      <div className="grid grid-cols-4 divide-x border-b bg-muted/30 max-sm:!grid-cols-2 max-sm:divide-y">
        {metrics.map((m) => (
          <MetricTab
            key={m.key}
            metric={m}
            data={data?.metrics.find((d) => d.key === m.key)}
            active={m.key === selected}
            onSelect={() => setSelected(m.key as ProfileMetric)}
          />
        ))}
      </div>
      <div className="px-4 pt-3 pb-4">
        <ChartLegend
          label={metric.label}
          previous={Boolean(points?.some((p) => p.previous != null))}
          className="justify-end mb-2"
        />
        {isError ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height: chartHeight }}
          >
            {t("profile.activity_error")}
          </div>
        ) : data && points ? (
          <TimeChart
            points={points}
            interval={data.range.interval}
            label={metric.label}
            height={chartHeight}
            format={(value) => formatNumber(value, { locale: i18n?.language })}
          />
        ) : (
          <div
            aria-busy
            className="rounded-md bg-muted/50 animate-pulse"
            style={{ height: chartHeight }}
          />
        )}
      </div>
    </section>
  );
}

/** The content the user changed last, linked to its edit page. */
function RecentContentCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data } = useRecentContent(10);

  return (
    <Card title={t("profile.recent_content")} className={className}>
      {!data ? (
        <div className="border-t py-2">
          <RowsSkeleton rows={5} />
        </div>
      ) : R.isEmpty(data) ? (
        <div className="border-t py-10 px-4 text-center text-sm text-muted-foreground">
          {t("profile.recent_content_empty")}
        </div>
      ) : (
        <ul className="border-t p-1.5">
          {data.map((item) => (
            <li key={`${item.model}-${item.id}`}>
              <RecentRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentRow({ item }: { item: RecentItem }) {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const model = discover?.models.find((m) => m.label === item.model);
  const icon = model?.admin.icon;
  const time = dayjs(item.timestamp);
  const deleted = item.action === "deleted";

  const content = (
    <>
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          loading="lazy"
          className="size-10 shrink-0 rounded-md object-cover bg-muted"
        />
      ) : (
        <span
          aria-hidden
          className="size-10 shrink-0 rounded-md bg-muted text-muted-foreground flex items-center justify-center text-sm font-semibold"
        >
          {icon ? (
            <span className={cn(icon, "text-lg")} />
          ) : (
            (item.model_label || item.title).slice(0, 1).toUpperCase()
          )}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "font-medium truncate",
            deleted && "line-through text-muted-foreground",
          )}
        >
          {item.title}
        </div>
        <div className="text-xs text-muted-foreground truncate first-letter:uppercase">
          {model?.verbose_name ?? item.model_label}
        </div>
      </div>
      <Badge tone={ACTION_TONES[item.action]} className="max-sm:hidden">
        {t(`profile.actions.${item.action}`)}
      </Badge>
      <time
        dateTime={item.timestamp}
        title={time.format("LLL")}
        className="w-24 text-right text-xs text-muted-foreground tabular-nums shrink-0"
      >
        {time.fromNow()}
      </time>
    </>
  );
  const className = "flex items-center gap-3 rounded-md px-2.5 py-2";

  return item.link ? (
    <Link
      to={`/content/${item.model}/${item.id}`}
      className={cn(
        className,
        "hover:bg-accent outline-none focus-visible:ring-3 focus-visible:ring-ring",
      )}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** The period's changes per model, with a bar of their share. */
function ByModelCard({ range }: { range: AnalyticsRange }) {
  const { t } = useTranslation();
  const { data } = useProfileActivity(range);

  return (
    <Card title={t("profile.by_model")}>
      {!data ? (
        <RowsSkeleton rows={4} />
      ) : R.isEmpty(data.models) ? (
        <div className="border-t py-10 px-4 text-center text-sm text-muted-foreground">
          {t("profile.by_model_empty")}
        </div>
      ) : (
        <BreakdownList
          dimension="models"
          rows={data.models.map((row) => ({
            key: row.key,
            // Model names are lowercase; rows start with a capital.
            label: row.label.charAt(0).toUpperCase() + row.label.slice(1),
            value: row.value,
            object: null,
          }))}
        />
      )}
    </Card>
  );
}
