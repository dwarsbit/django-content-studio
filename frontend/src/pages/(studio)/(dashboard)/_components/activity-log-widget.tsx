import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDiscover } from "@/hooks/use-discover";
import { useHttp } from "@/hooks/use-http";
import { type ActivityLogEntry, type DashboardWidget } from "@/types";

import { Widget, WidgetEmpty, WidgetLoading } from "./widget";

/**
 * The latest changes made in the admin: who did what to which object,
 * with the object as a link (deleted objects have none), and the model
 * and the time under it.
 */
export function ActivityLogWidget({ widget }: { widget: DashboardWidget }) {
  const http = useHttp();
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { data } = useQuery({
    retry: false,
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
        <ul>
          {data.map((item) => {
            const user = item.user?.__str__ ?? "";

            return (
              <li
                key={item.id}
                className="flex items-center gap-3 border-t px-4 py-2.5"
              >
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px] font-semibold bg-secondary text-secondary-foreground uppercase">
                    {user.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
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
                  <div className="text-xs text-muted-foreground truncate">
                    <span className="first-letter:uppercase inline-block">
                      {modelName(item.object_model)}
                    </span>
                    {` · ${dayjs(item.action_time).fromNow()}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}
