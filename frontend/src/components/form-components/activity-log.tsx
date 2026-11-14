import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as R from "ramda";
import { useContext, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { ResourcePathContext } from "@/components/content-editor/resource-path";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useHttp } from "@/hooks/use-http";
import { cn } from "@/lib/utils";
import type { ActivityLogEntry, FormField, Model } from "@/types";

import { VersionDialog } from "./version-dialog";

dayjs.extend(relativeTime);

/**
 * The ActivityLog form component: the object's history — additions,
 * changes and deletions recorded for it, most recent first, with the
 * fields each change touched — under the title configured on the
 * backend component (defaulting to "Activity"). With the history app,
 * an entry opens its version: what changed, and Restore. Renders only
 * for saved objects: a create has no history.
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
  const resourcePath =
    useContext(ResourcePathContext) ?? `/content/${model.label}`;
  const [openEntry, setOpenEntry] = useState<number | null>(null);

  const { data } = useQuery({
    enabled: Boolean(id),
    retry: false,
    queryKey: ["activity", model.label, id, resourcePath],
    async queryFn() {
      const { data } = await http.get<ActivityLogEntry[]>(
        `${resourcePath}/${id}/activity`,
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
            {data.map((item) => {
              const content = (
                <>
                  <UserAvatar
                    name={item.user?.__str__ ?? ""}
                    initials={item.user?.__str__.slice(0, 2)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 text-sm">
                    <div>
                      <span className="font-medium">{item.user?.__str__}</span>{" "}
                      <span className="text-muted-foreground">
                        {t(
                          `dashboard.widgets.activity_log.action_flags.${item.action_flag}`,
                        )}
                      </span>
                    </div>
                    {item.message && (
                      <div className="text-xs text-muted-foreground break-words">
                        {item.message}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {dayjs(item.action_time).fromNow()}
                    </div>
                  </div>
                </>
              );

              return (
                <li key={item.id}>
                  {item.has_version ? (
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2.5 py-2.5 text-left rounded-md -mx-1.5 px-1.5",
                        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                      title={t("history.open")}
                      onClick={() => setOpenEntry(item.id)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-start gap-2.5 py-2.5">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <VersionDialog
          model={model}
          resourcePath={resourcePath}
          objectId={String(id)}
          entryId={openEntry}
          onClose={() => setOpenEntry(null)}
        />
      </div>
    )
  );
}
