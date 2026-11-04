import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useHttp } from "@/hooks/use-http";
import { formatExactNumber, formatNumber } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import { type DashboardWidget } from "@/types";

import { widgetRefetchInterval } from "./refresh";
import { ViewAll, Widget, WidgetEmpty, WidgetLoading } from "./widget";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

/**
 * A list of links to content. When every item belongs to one model,
 * the header offers "View all" to that model's list (or to the widget's
 * own view_all). Items without a model and ID are rows, not links; an
 * item's value shows at the end of its row.
 */
export function ContentListWidget({ widget }: { widget: DashboardWidget }) {
  const { t, i18n } = useTranslation();
  const http = useHttp();
  const { data } = useQuery({
    retry: false,
    refetchInterval: widgetRefetchInterval(widget),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryKey: ["dashboard", "widg", widget.widget_id],
    async queryFn() {
      const { data } = await http.get<{
        title: string;
        description: string;
        view_all?: string;
        content: {
          id: string;
          model: string;
          title: string;
          description?: string;
          status?: string;
          status_variant?: StatusVariant;
          thumbnail?: string;
          timestamp?: string | null;
          value?: number | null;
        }[];
      }>(`/dashboard/widgets/${widget.widget_id}`);

      return data;
    },
  });

  const models = R.uniq((data?.content ?? []).map((item) => item.model));
  const model = models.length === 1 && models[0] ? models[0] : null;
  const viewAll = data?.view_all || (model ? `/content/${model}` : null);

  return (
    <Widget
      title={data?.title ?? widget.name}
      description={data?.description}
      action={viewAll && <ViewAll to={viewAll} />}
    >
      {!data ? (
        <WidgetLoading />
      ) : R.isEmpty(data.content) ? (
        <WidgetEmpty>
          {t("dashboard.widgets.content_list.empty_state")}
        </WidgetEmpty>
      ) : (
        <ul className="border-t p-1.5">
          {data.content.map((item, index) => {
            const row = (
              <>
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    loading="lazy"
                    className="size-10 shrink-0 rounded-md object-cover bg-muted"
                  />
                ) : null}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.title}</div>
                  {item.description ? (
                    <div className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </div>
                  ) : null}
                </div>
                {item.status ? (
                  <StatusBadge variant={item.status_variant}>
                    {item.status}
                  </StatusBadge>
                ) : null}
                {item.timestamp ? (
                  <time
                    dateTime={item.timestamp}
                    title={dayjs(item.timestamp).format("LLL")}
                    className="text-xs text-muted-foreground tabular-nums shrink-0"
                  >
                    {dayjs(item.timestamp).fromNow()}
                  </time>
                ) : null}
                {item.value != null ? (
                  <span
                    className="text-sm font-medium tabular-nums shrink-0"
                    title={formatExactNumber(item.value, {
                      locale: i18n?.language,
                    })}
                  >
                    {formatNumber(item.value, { locale: i18n?.language })}
                  </span>
                ) : null}
              </>
            );

            return (
              <li key={`${item.model}-${item.id}-${index}`}>
                {item.model && item.id ? (
                  <Link
                    to={`/content/${item.model}/${item.id}`}
                    className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-accent outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 rounded-md px-2.5 py-2">
                    {row}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}

type StatusVariant = "default" | "success" | "warning" | "info" | "danger";

/** An item's state, as a pill with a dot in the variant's color. */
function StatusBadge({
  variant = "default",
  children,
}: {
  variant?: StatusVariant;
  children: string;
}) {
  return (
    <span
      className={cn(
        "hidden sm:inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 before:size-1.5 before:rounded-full before:bg-current",
        {
          "bg-accent text-muted-foreground": variant === "default",
          "bg-success/10 text-success": variant === "success",
          "bg-warning/10 text-warning": variant === "warning",
          "bg-sky-500/10 text-sky-600 dark:text-sky-400": variant === "info",
          "bg-destructive/10 text-destructive": variant === "danger",
        },
      )}
    >
      {children}
    </span>
  );
}
