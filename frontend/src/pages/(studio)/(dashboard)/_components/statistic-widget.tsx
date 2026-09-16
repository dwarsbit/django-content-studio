import { useQuery } from "@tanstack/react-query";
import { PiTrendDownBold, PiTrendUpBold } from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import { type DashboardWidget } from "@/types";

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
        trend: string;
        trend_sentiment: "default" | "positive" | "negative";
      }>(`/dashboard/widgets/${widget.widget_id}`);

      return data;
    },
  });
  const numTrend = data && Number(data.trend);

  return (
    <div className="p-4 min-h-[100px]">
      {data && (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-gray-400 truncate">{data.title}</h2>
            {numTrend! > 0 && (
              <Badge
                variant="outline"
                className={cn({
                  "text-emerald-500": data.trend_sentiment === "positive",
                  "text-rose-500": data.trend_sentiment === "negative",
                })}
              >
                {numTrend! < 0 ? <PiTrendDownBold /> : <PiTrendUpBold />}
                {`${numTrend! < 0 ? "-" : "+"}${data.trend}%`}
              </Badge>
            )}
          </div>

          <div className="text-gray-800 mb-6 font-semibold text-3xl">
            <span>{data.prefix}</span>
            <span>{data.value}</span>
            <span>{data.suffix}</span>
          </div>
        </div>
      )}
    </div>
  );
}
