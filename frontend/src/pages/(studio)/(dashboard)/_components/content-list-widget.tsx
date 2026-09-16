import { useQuery } from "@tanstack/react-query";
import * as R from "ramda";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Spinner } from "@/components/ui/spinner";
import { useHttp } from "@/hooks/use-http";
import { type DashboardWidget } from "@/types";

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
        description: number;
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

  return !data ? (
    <div className="py-24 flex items-center justify-center">
      <Spinner />
    </div>
  ) : (
    <div>
      <div className="p-4 leading-tight">
        <h2 className="font-medium text-gray-900">{data.title}</h2>
        {data.description && (
          <div className="text-gray-500">{data.description}</div>
        )}
      </div>
      {R.isEmpty(data.content) ? (
        <div className="text-center py-12 border-t text-gray-400 select-none">
          {t("dashboard.widgets.content_list.empty_state")}
        </div>
      ) : (
        <ul>
          {data.content.map(({ id, model, title, description }) => (
            <li key={id}>
              <Link
                to={{ hash: `editor:${model}:${id}` }}
                className="block px-4 py-2 border-t hover:bg-gray-100"
              >
                <div className="text-gray-700">{title}</div>
                <div className="text-gray-500 text-sm">{description}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
