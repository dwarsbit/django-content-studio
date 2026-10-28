import { useQuery } from "@tanstack/react-query";
import { PiTrendDownBold, PiTrendUpBold } from "react-icons/pi";

import { Spinner } from "@/components/ui/spinner";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import { type DashboardWidget } from "@/types";

/**
 * One number with its title and, when the widget reports one, the
 * trend as a percentage colored by its sentiment.
 */
export function StatisticWidget({ widget }: { widget: DashboardWidget }) {
  const http = useHttp();
  const { data } = useQuery({
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryKey: ["dashboard", "widg", widget.widget_id],
    async queryFn() {
      const { data } = await http.get<{
        title: string;
        value: number;
        suffix: string;
        prefix: string;
        trend: string | null;
        trend_sentiment: "default" | "positive" | "negative";
      }>(`/dashboard/widgets/${widget.widget_id}`);

      return data;
    },
  });
  const trend = data?.trend != null ? Number(data.trend) : NaN;
  const hasTrend = Number.isFinite(trend) && trend !== 0;

  return (
    <section className="rounded-lg border bg-card shadow-xs p-4 min-h-[92px]">
      {data ? (
        <>
          <div className="text-sm text-muted-foreground truncate">
            {data.title}
          </div>
          <div className="flex items-end justify-between gap-2 mt-1">
            <div className="text-3xl font-semibold tabular-nums leading-none truncate">
              {data.prefix}
              {data.value}
              {data.suffix}
            </div>
            {hasTrend && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium tabular-nums mb-0.5 shrink-0",
                  {
                    "text-success": data.trend_sentiment === "positive",
                    "text-destructive": data.trend_sentiment === "negative",
                    "text-muted-foreground": data.trend_sentiment === "default",
                  },
                )}
              >
                {trend < 0 ? <PiTrendDownBold /> : <PiTrendUpBold />}
                {`${trend < 0 ? "-" : "+"}${Math.abs(trend)}%`}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="h-full min-h-[60px] flex items-center justify-center">
          <Spinner />
        </div>
      )}
    </section>
  );
}
