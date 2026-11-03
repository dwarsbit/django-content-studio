import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import { type TFunction } from "i18next";
import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { PiMinusBold, PiPencilSimpleBold, PiPlusBold } from "react-icons/pi";
import { Link } from "react-router";

import { UserAvatar } from "@/components/ui/user-avatar";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import { type ActivityLogEntry, type DashboardWidget } from "@/types";

import { widgetRefetchInterval } from "./refresh";
import { Widget, WidgetEmpty, WidgetLoading } from "./widget";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

/**
 * The latest changes made in the admin, grouped by day: who did what to
 * which object, with the object as a link (deleted objects have none),
 * the model under it and the time on the right. A badge on the avatar
 * shows the kind of change.
 */
export function ActivityLogWidget({ widget }: { widget: DashboardWidget }) {
  const http = useHttp();
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { data } = useQuery({
    retry: false,
    refetchInterval: widgetRefetchInterval(widget),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryKey: ["dashboard", "widg", widget.widget_id],
    async queryFn() {
      const { data } = await http.get<ActivityLogEntry[]>(
        `/dashboard/widgets/${widget.widget_id}`,
      );

      return data;
    },
  });

  const modelName = (label: string) =>
    discover?.models.find(R.whereEq({ label }))?.verbose_name ?? label;

  return (
    <Widget
      title={t("dashboard.widgets.activity_log.title")}
      description={t("dashboard.widgets.activity_log.subtitle")}
    >
      {!data ? (
        <WidgetLoading />
      ) : R.isEmpty(data) ? (
        <WidgetEmpty>{t("dashboard.widgets.activity_log.empty")}</WidgetEmpty>
      ) : (
        <ul className="border-t p-1.5">
          {groupByDay(data).map(([day, entries]) => (
            <li key={day}>
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {dayLabel(day, t)}
              </div>
              <ul>
                {entries.map((item) => {
                  const user = item.user?.__str__ ?? "";
                  const time = dayjs(item.action_time);

                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-md px-2.5 py-1.5 hover:bg-accent"
                    >
                      <span className="relative shrink-0">
                        <UserAvatar name={user} className="size-8" />
                        <ActionBadge flag={item.action_flag} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate">
                          <span className="font-medium">{user}</span>{" "}
                          <span className="text-muted-foreground">
                            {t(
                              `dashboard.widgets.activity_log.action_flags.${item.action_flag}`,
                            )}
                          </span>{" "}
                          {item.action_flag === 3 ? (
                            <span>{item.object_repr}</span>
                          ) : (
                            <Link
                              className="font-medium hover:underline"
                              to={`/content/${item.object_model}/${item.object_id}`}
                            >
                              {item.object_repr}
                            </Link>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate first-letter:uppercase">
                          {modelName(item.object_model)}
                        </div>
                      </div>
                      <time
                        dateTime={item.action_time}
                        title={time.format("LLL")}
                        className="text-xs text-muted-foreground tabular-nums shrink-0"
                      >
                        {time.isSame(dayjs(), "day")
                          ? time.fromNow()
                          : time.format("LT")}
                      </time>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

/** The entries per day (YYYY-MM-DD, local time), newest first. */
function groupByDay(
  entries: ActivityLogEntry[],
): [string, ActivityLogEntry[]][] {
  const days = new Map<string, ActivityLogEntry[]>();

  for (const entry of entries) {
    const day = dayjs(entry.action_time).format("YYYY-MM-DD");
    days.set(day, [...(days.get(day) ?? []), entry]);
  }

  return [...days.entries()];
}

function dayLabel(day: string, t: TFunction): string {
  const date = dayjs(day);

  if (date.isSame(dayjs(), "day")) {
    return t("dashboard.widgets.activity_log.today");
  }
  if (date.isSame(dayjs().subtract(1, "day"), "day")) {
    return t("dashboard.widgets.activity_log.yesterday");
  }
  return date.format("LL");
}

/** The kind of change, on the corner of the avatar. */
function ActionBadge({ flag }: { flag: number }) {
  const Icon =
    flag === 1 ? PiPlusBold : flag === 3 ? PiMinusBold : PiPencilSimpleBold;

  return (
    <span
      aria-hidden
      className={cn(
        "absolute -right-1 -bottom-1 size-4 rounded-full border-2 border-card flex items-center justify-center text-white",
        {
          "bg-success": flag === 1,
          "bg-sky-500": flag === 2,
          "bg-destructive": flag === 3,
        },
      )}
    >
      <Icon className="size-2" />
    </span>
  );
}
