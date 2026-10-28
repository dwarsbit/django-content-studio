import { type ComponentType, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { PageBody } from "@/components/ui/page-header";
import { useDiscover } from "@/hooks/use-discover";
import { useMe } from "@/hooks/use-me";
import { cn, getTimeOfDay } from "@/lib/utils";
import { type DashboardWidget, DashboardWidgetType } from "@/types";

import { ActivityLogWidget } from "./_components/activity-log-widget";
import { ContentListWidget } from "./_components/content-list-widget";
import { ScheduledTasksWidget } from "./_components/scheduled-tasks-widget";
import { StatisticWidget } from "./_components/statistic-widget";

const WIDGET_COMPONENTS: Partial<
  Record<DashboardWidgetType, ComponentType<{ widget: DashboardWidget }>>
> = {
  [DashboardWidgetType.ActivityLogWidget]: ActivityLogWidget,
  [DashboardWidgetType.StatisticWidget]: StatisticWidget,
  [DashboardWidgetType.ScheduledTasksWidget]: ScheduledTasksWidget,
  [DashboardWidgetType.ContentListWidget]: ContentListWidget,
};

// The grid has four columns at xl and two at md: a widget's `col_span`
// is clamped to the columns available, so wide widgets fill the row
// instead of overflowing it.
const COL_SPAN: Record<number, string> = {
  1: "",
  2: "md:col-span-2",
  3: "md:col-span-2 xl:col-span-3",
  4: "md:col-span-2 xl:col-span-4",
};

/**
 * The dashboard: the greeting with today's date as its title, and the
 * site's widgets in a grid.
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data: discover } = useDiscover();
  const { data: me } = useMe();
  const timeOfDay = useMemo(() => getTimeOfDay(), []);
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date()),
    [i18n.language],
  );

  if (!me || !discover) {
    return null;
  }

  return (
    <PageBody className="pt-10 pb-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {[t(`dashboard.greetings.${timeOfDay}`), me.first_name, "👋"]
            .filter(Boolean)
            .join(" ")}
        </h1>
        <div className="text-muted-foreground mt-1 first-letter:uppercase">
          {today}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {discover.dashboard.widgets.map((widget) => {
          const Comp = widget.widget_type
            ? WIDGET_COMPONENTS[widget.widget_type]
            : undefined;
          const span = Math.min(Math.max(widget.col_span, 1), 4);

          return Comp ? (
            <div
              key={widget.widget_id}
              className={cn("min-w-0", COL_SPAN[span])}
            >
              <Comp widget={widget} />
            </div>
          ) : null;
        })}
      </div>
    </PageBody>
  );
}
