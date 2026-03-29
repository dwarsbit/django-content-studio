import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useDiscover } from "@/hooks/use-discover";
import { useMe } from "@/hooks/use-me";
import { cn, getTimeOfDay } from "@/lib/utils";
import { DashboardWidgetType } from "@/types";

import { ActivityLogWidget } from "./_components/activity-log-widget";
import { ContentListWidget } from "./_components/content-list-widget";
import { ScheduledTasksWidget } from "./_components/scheduled-tasks-widget";
import { StatisticWidget } from "./_components/statistic-widget";

const WIDGET_COMPONENTS: Record<any, any> = {
  [DashboardWidgetType.ActivityLogWidget]: ActivityLogWidget,
  [DashboardWidgetType.StatisticWidget]: StatisticWidget,
  [DashboardWidgetType.ScheduledTasksWidget]: ScheduledTasksWidget,
  [DashboardWidgetType.ContentListWidget]: ContentListWidget,
};

export function DashboardPage() {
  const { t } = useTranslation();
  const { data: discover } = useDiscover();
  const { data: me } = useMe();
  const timeOfDay = useMemo(() => getTimeOfDay(), []);

  return (
    me &&
    discover && (
      <div className="overflow-hidden flex-1 flex flex-col max-w-7xl mx-auto w-full">
        <div className="px-9 pt-16 pb-6 bg-background">
          <h2 className="text-3xl font-semibold">
            {`${t(`dashboard.greetings.${timeOfDay}`)} ${me?.first_name ?? ""} 👋`}
          </h2>
        </div>
        <div className="bg-background flex-1 p-5 flex flex-col md:grid md:items-start md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 overflow-y-auto scrollbar">
          {discover.dashboard.widgets.map((widget) => {
            const Comp = WIDGET_COMPONENTS[widget.name];

            return Comp ? (
              <div
                key={widget.widget_id}
                className={cn({
                  "border bg-card rounded-lg":
                    widget.name !== DashboardWidgetType.SpacingWidget,
                })}
                style={{
                  gridColumn: `span ${widget.col_span} / span ${widget.col_span}`,
                }}
              >
                <Comp widget={widget} />
              </div>
            ) : null;
          })}
        </div>
      </div>
    )
  );
}
