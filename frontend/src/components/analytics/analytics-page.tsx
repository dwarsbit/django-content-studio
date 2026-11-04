import { useTranslation } from "react-i18next";
import { PiArrowUpRightBold, PiChartLineUpBold, PiXBold } from "react-icons/pi";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { PageBody, PageHeader, Toolbar } from "@/components/ui/page-header";
import type { AnalyticsPageExtension } from "@/types";

import {
  type AnalyticsRange,
  hasNoPath,
  PRESETS,
  type RangeKey,
  rangeParams,
  type SummaryData,
  useAnalyticsConfig,
  useReport,
} from "./data";
import { LiveVisitors, ReportMessage } from "./parts";
import { RangeSelect } from "./range-select";
import { BREAKDOWN_GROUPS, BreakdownCard, Overview } from "./report";

const SOURCE = "/analytics";

function rangeFromParams(params: URLSearchParams): AnalyticsRange {
  const key = params.get("range") as RangeKey | null;

  if (key === "custom" && params.get("start") && params.get("end")) {
    return { key, start: params.get("start")!, end: params.get("end")! };
  }

  return { key: key && (PRESETS as string[]).includes(key) ? key : "30d" };
}

/**
 * The AnalyticsPage: the site's metrics against the period before, a
 * chart, and the top pages, sources, locations and devices. The range
 * and a page filter live in the URL, so a report can be linked.
 */
export function AnalyticsPageView({ page }: { page: AnalyticsPageExtension }) {
  const { t } = useTranslation();
  const config = useAnalyticsConfig();
  const [params, setParams] = useSearchParams();
  const range = rangeFromParams(params);
  const path = params.get("path");
  const summary = useReport<SummaryData>(
    SOURCE,
    { part: "summary", path, ...rangeParams(range) },
    { enabled: Boolean(config) },
  );
  const live = useReport<{ visitors: number }>(
    SOURCE,
    { part: "realtime" },
    { enabled: Boolean(config?.realtime) && !path, refetchInterval: 30_000 },
  );
  const data =
    summary.data && !hasNoPath(summary.data) ? summary.data : undefined;
  const visitors =
    live.data && "visitors" in live.data ? live.data.visitors : null;

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setParams(next, { replace: true });
  };

  if (!config) return null;

  // Re-mount the report on another range or page, so every card and the
  // chart start from their first tab together.
  const reportKey = JSON.stringify([range, path]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <PageHeader
        icon={<PiChartLineUpBold />}
        title={page.config.title}
        description={page.config.description ?? undefined}
        actions={
          <>
            {visitors != null && (
              <span className="max-md:hidden">
                <LiveVisitors count={visitors} />
              </span>
            )}
            <RangeSelect
              value={range}
              onChange={(next) =>
                update({
                  range: next.key,
                  start: next.start ?? null,
                  end: next.end ?? null,
                })
              }
            />
            {data?.dashboard_url && (
              <Button variant="outline" asChild className="max-md:hidden">
                <a href={data.dashboard_url} target="_blank" rel="noreferrer">
                  {t("analytics.open_in", { provider: config.provider })}
                  <PiArrowUpRightBold data-icon="inline-end" />
                </a>
              </Button>
            )}
          </>
        }
      >
        {path && (
          <Toolbar>
            <span className="inline-flex items-center gap-1.5 h-7 max-w-full rounded-md border bg-muted/50 pl-2.5 pr-1 text-sm">
              <span className="text-muted-foreground shrink-0">
                {t("analytics.page_is")}
              </span>
              <span className="font-medium truncate">{path}</span>
              <button
                type="button"
                onClick={() => update({ path: null })}
                className="size-5 shrink-0 rounded flex items-center justify-center hover:bg-accent text-muted-foreground"
                aria-label={t("analytics.remove_filter")}
              >
                <PiXBold className="size-3" />
              </button>
            </span>
          </Toolbar>
        )}
      </PageHeader>
      <PageBody className="space-y-5">
        {summary.isError ? (
          <ReportMessage
            kind="error"
            provider={config.provider}
            onRetry={() => summary.refetch()}
          />
        ) : (
          <div key={reportKey} className="space-y-5">
            <Overview
              source={SOURCE}
              range={range}
              config={config}
              summary={data}
              extraParams={{ path }}
            />
            <div className="grid gap-5 md:grid-cols-2">
              {BREAKDOWN_GROUPS.filter(
                (group) => !(path && group.key === "pages"),
              ).map((group) => (
                <BreakdownCard
                  key={group.key}
                  source={SOURCE}
                  range={range}
                  config={config}
                  group={group}
                  extraParams={{ path }}
                />
              ))}
            </div>
          </div>
        )}
      </PageBody>
    </div>
  );
}
