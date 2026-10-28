import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as R from "ramda";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
        <h2 className="font-semibold">{formField.title}</h2>
        {!data ? (
          <div className="py-6 flex items-center justify-center">
            <Spinner />
          </div>
        ) : R.isEmpty(data) ? (
          <div className="text-muted-foreground text-sm mt-1">
            {t("form_components.activity.empty")}
          </div>
        ) : (
          <ul className="mt-2 divide-y">
            {data.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5 py-2.5">
                <Avatar className="size-6 mt-0.5">
                  <AvatarFallback className="text-[10px] font-semibold bg-secondary text-secondary-foreground uppercase">
                    {item.user?.__str__.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 text-sm">
                  <div>
                    <span className="font-medium">{item.user?.__str__}</span>{" "}
                    <span className="text-muted-foreground">
                      {t(
                        `dashboard.widgets.activity_log.action_flags.${item.action_flag}`,
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
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
