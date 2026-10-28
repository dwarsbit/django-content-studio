import { useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useHttp } from "@/hooks/use-http";
import { type DashboardWidget } from "@/types";

import { ViewAll, Widget, WidgetEmpty, WidgetLoading } from "./widget";

/**
 * A list of links to content. When every item belongs to one model,
 * the header offers "View all" to that model's list.
 */
export function ContentListWidget({ widget }: { widget: DashboardWidget }) {
  const { t } = useTranslation();
  const http = useHttp();
  const { data } = useQuery({
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryKey: ["dashboard", "widg", widget.widget_id],
    async queryFn() {
      const { data } = await http.get<{
        title: string;
        description: string;
        content: {
          id: string;
          model: string;
          title: string;
          description?: string;
        }[];
      }>(`/dashboard/widgets/${widget.widget_id}`);

      return data;
    },
  });

  const models = R.uniq((data?.content ?? []).map((item) => item.model));
  const model = models.length === 1 ? models[0] : null;

  return (
    <Widget
      title={data?.title ?? widget.name}
      description={data?.description}
      action={model && <ViewAll to={`/content/${model}`} />}
    >
      {!data ? (
        <WidgetLoading />
      ) : R.isEmpty(data.content) ? (
        <WidgetEmpty>
          {t("dashboard.widgets.content_list.empty_state")}
        </WidgetEmpty>
      ) : (
        <ul>
          {data.content.map(({ id, model, title, description }) => (
            <li key={`${model}-${id}`}>
              <Link
                to={`/content/${model}/${id}`}
                className="block px-4 py-2.5 border-t hover:bg-accent"
              >
                <div className="font-medium truncate">{title}</div>
                {description ? (
                  <div className="text-xs text-muted-foreground truncate">
                    {description}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
