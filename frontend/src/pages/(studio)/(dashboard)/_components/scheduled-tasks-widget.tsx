import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import * as R from "ramda";
import { useTranslation } from "react-i18next";
import {
  PiCalendarBlankBold,
  PiClockBold,
  PiPlayCircleBold,
} from "react-icons/pi";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import { type DashboardWidget, type DateTimeString } from "@/types";

export function ScheduledTasksWidget({ widget }: { widget: DashboardWidget }) {
  const http = useHttp();
  const { t } = useTranslation();
  const { data } = useQuery({
    retry: false,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryKey: ["dashboard", "widg", widget.widget_id],
    async queryFn() {
      const { data } = await http.get<{
        title: string;
        description: number;
        tasks: {
          last_run_at: DateTimeString;
          next_run_at: DateTimeString;
          duration: number;
          title: string;
          description: string;
          status: "RUNNING" | "SCHEDULED" | "SUCCESS" | "FAILURE";
          error_message: string | null;
        }[];
      }>(`/dashboard/widgets/${widget.widget_id}`);

      return data;
    },
  });

  return (
    <div className="min-h-[100px]">
      {!data ? (
        <div className="p-12 flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div>
          <div className="p-4">
            <h2 className="font-medium text-gray-900">{data.title}</h2>
            <div className="text-gray-500">{data.description}</div>
          </div>
          {R.isEmpty(data.tasks) ? (
            <div className="py-12 text-center text-gray-400 select-none">
              {t("dashboard.widgets.scheduled_tasks.empty")}
            </div>
          ) : (
            <ul>
              {data.tasks.map((task, idx) => (
                <li key={idx} className="border-t p-4">
                  <div className="mb-1 flex items-start justify-between">
                    <div>
                      <h4 className="text-gray-700">{task.title}</h4>
                      <div className="text-gray-500">{task.description}</div>
                    </div>

                    <Badge
                      className={cn({
                        "bg-emerald-100 text-emerald-500":
                          task.status === "SUCCESS",
                        "bg-rose-100 text-rose-500": task.status === "FAILURE",
                        "bg-gray-100 text-gray-500":
                          task.status === "SCHEDULED",
                        "bg-blue-100 text-blue-600": task.status === "RUNNING",
                      })}
                    >
                      {task.status === "RUNNING" && (
                        <Spinner className="size-3" />
                      )}
                      {t(
                        `dashboard.widgets.scheduled_tasks.status.${task.status}`,
                      )}
                    </Badge>
                  </div>
                  <div className="flex gap-3 items-center text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <PiClockBold />
                      {dayjs(task.last_run_at).fromNow()}
                    </div>
                    <div className="flex items-center gap-1">
                      <PiPlayCircleBold />
                      {`${task.duration}s`}
                    </div>
                    <div className="flex items-center gap-1">
                      <PiCalendarBlankBold />
                      {`${t("dashboard.widgets.scheduled_tasks.next")} ${dayjs(task.next_run_at).fromNow()}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
