import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { NotificationRow } from "@/components/notifications/notification-list";
import { Button } from "@/components/ui/button";
import { useHttp } from "@/hooks/use-http";
import {
  type Notification,
  useMarkRead,
  useNotificationsEnabled,
  useNotificationStatus,
} from "@/hooks/use-notifications";
import { useTenant } from "@/tenant";
import { type DashboardWidget } from "@/types";

import { ViewAll, Widget, WidgetEmpty, WidgetLoading } from "./widget";

export interface NotificationsWidgetData {
  title: string;
  description: string;
  unread: number;
  results: Notification[];
}

/**
 * The editor's latest notifications, unread ones marked, with the
 * unread count, mark all as read and a link to all of them. It reloads when the polled status moves (a new
 * notification) and after marking one as read, like the list.
 */
export function NotificationsWidget({ widget }: { widget: DashboardWidget }) {
  const http = useHttp();
  const { t } = useTranslation();
  const { tenantId } = useTenant();
  const enabled = useNotificationsEnabled();
  const { data: status } = useNotificationStatus();
  const { mutate: markRead, isPending: isMarking } = useMarkRead();
  const { data } = useQuery({
    enabled,
    retry: false,
    placeholderData: keepPreviousData,
    // Under "notifications", so marking as read refreshes it too.
    queryKey: [
      "notifications",
      tenantId ?? "",
      "widget",
      widget.widget_id,
      status?.latest ?? null,
    ],
    async queryFn() {
      const { data } = await http.get<NotificationsWidgetData>(
        `/dashboard/widgets/${widget.widget_id}`,
      );

      return data;
    },
  });

  if (!enabled) {
    return null;
  }

  const unread = status?.unread ?? data?.unread ?? 0;

  return (
    <Widget
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">
            {data?.title ?? t("notifications.title")}
          </span>
          {unread ? (
            <span
              aria-label={t("notifications.widget_unread", { count: unread })}
              className="rounded-full bg-primary text-primary-foreground px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums"
            >
              {unread}
            </span>
          ) : null}
        </span>
      }
      description={data?.description || undefined}
      action={
        <div className="flex items-center gap-1 shrink-0">
          {unread ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              disabled={isMarking}
              onClick={() =>
                markRead({
                  before: status?.latest ?? new Date().toISOString(),
                })
              }
            >
              {t("notifications.mark_all_read")}
            </Button>
          ) : null}
          <ViewAll to="/notifications" />
        </div>
      }
    >
      {!data ? (
        <WidgetLoading />
      ) : data.results.length === 0 ? (
        <WidgetEmpty>{t("notifications.empty_all_title")}</WidgetEmpty>
      ) : (
        <ul className="border-t">
          {data.results.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
            />
          ))}
        </ul>
      )}
    </Widget>
  );
}
