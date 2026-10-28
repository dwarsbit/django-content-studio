import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
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

import { Widget, WidgetEmpty, WidgetLoading } from "./widget";

dayjs.extend(relativeTime);

type TaskStatus = "RUNNING" | "SCHEDULED" | "SUCCESS" | "FAILURE";

/**
 * Background jobs and their last run: the title and description, a
 * status badge with a dot (or a spinner while running) and a meta line
 * with the last run, the duration and the next run. Unknown values are
 * left out, such as the next run of a task that is not scheduled again.
 */
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
        description: string;
        tasks: {
          last_run_at: DateTimeString | null;
          next_run_at: DateTimeString | null;
          duration: number | null;
          title: string;
          description: string;
          status: TaskStatus;
          error_message: string | null;
        }[];
      }>(`/dashboard/widgets/${widget.widget_id}`);

      return data;
    },
  });

  return (
    <Widget title={data?.title ?? widget.name} description={data?.description}>
      {!data ? (
        <WidgetLoading />
      ) : R.isEmpty(data.tasks) ? (
        <WidgetEmpty>
          {t("dashboard.widgets.scheduled_tasks.empty")}
        </WidgetEmpty>
      ) : (
        <ul>
          {data.tasks.map((task, idx) => (
            <li key={idx} className="border-t px-4 py-3 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium">{task.title}</h3>
                  {task.description && (
                    <div className="text-xs text-muted-foreground">
                      {task.description}
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className="gap-1.5 pl-1.5 shrink-0">
                  {task.status === "RUNNING" ? (
                    <Spinner className="size-3" />
                  ) : (
                    <span
                      className={cn("size-1.5 rounded-full", {
                        "bg-success": task.status === "SUCCESS",
                        "bg-destructive": task.status === "FAILURE",
                        "bg-muted-foreground/60": task.status === "SCHEDULED",
                      })}
                    />
                  )}
                  {t(`dashboard.widgets.scheduled_tasks.status.${task.status}`)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 items-center text-xs text-muted-foreground empty:hidden">
                {task.last_run_at && (
                  <span className="inline-flex items-center gap-1">
                    <PiClockBold />
                    {dayjs(task.last_run_at).fromNow()}
                  </span>
                )}
                {task.duration != null && (
                  <span className="inline-flex items-center gap-1">
                    <PiPlayCircleBold />
                    {`${task.duration}s`}
                  </span>
                )}
                {task.next_run_at && (
                  <span className="inline-flex items-center gap-1">
                    <PiCalendarBlankBold />
                    {`${t("dashboard.widgets.scheduled_tasks.next")} ${dayjs(task.next_run_at).fromNow()}`}
                  </span>
                )}
              </div>
              {task.error_message && task.status !== "SUCCESS" && (
                <div className="text-xs text-destructive">
                  {task.error_message}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
