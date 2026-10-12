import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as R from "ramda";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/ui/spinner";
import { useHttp } from "@/hooks/use-http";
import type { ActivityLogEntry, FormField, Model } from "@/types";

dayjs.extend(relativeTime);

/**
 * The ActivityLog form component: the object's history — additions,
 * changes and deletions recorded for it, most recent first — under
 * the title configured on the backend component (defaulting to
 * "Activity"). Renders only for saved objects: a create has no
 * history.
 */
export function ActivityLog({
  model,
  formField,
}: {
  model: Model;
  formField: FormField;
}) {
  const { t } = useTranslation();
  const http = useHttp();
  const form = useFormContext();
  const id = form.watch("id");

  const { data } = useQuery({
    enabled: Boolean(id),
    retry: false,
    queryKey: ["activity", model.label, id],
    async queryFn() {
      const { data } = await http.get<ActivityLogEntry[]>(
        `/content/${model.label}/${id}/activity`,
      );

      return data;
    },
  });

  return (
    !R.isNil(id) && (
      <div>
        <h2 className="font-medium">{formField.title}</h2>
        {!data ? (
          <div className="py-6 flex items-center justify-center">
            <Spinner />
          </div>
        ) : R.isEmpty(data) ? (
          <div className="text-muted-foreground text-sm">
            {t("form_components.activity.empty")}
          </div>
        ) : (
          <ul className="mt-3">
            {data.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 py-2 border-t first:border-t-0 first:pt-0 mt-2 first:mt-0"
              >
                <div className="shrink-0 rounded-full text-xs bg-accent size-6 flex items-center justify-center font-semibold uppercase select-none">
                  {item.user?.__str__.slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="flex gap-1 flex-wrap">
                    <div className="shrink-0 font-medium">
                      {item.user?.__str__}
                    </div>
                    <div className="text-muted-foreground">
                      {t(
                        `dashboard.widgets.activity_log.action_flags.${item.action_flag}`,
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {dayjs(item.action_time).fromNow()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  );
}
