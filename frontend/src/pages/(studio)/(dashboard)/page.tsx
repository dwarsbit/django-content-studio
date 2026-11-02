import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { PageBody } from "@/components/ui/page-header";
import { useDiscover } from "@/hooks/use-discover";
import { useMe } from "@/hooks/use-me";
import { getTimeOfDay } from "@/lib/utils";

import { DashboardGrid } from "./_components/dashboard-grid";

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

      <DashboardGrid widgets={discover.dashboard.widgets} />
    </PageBody>
  );
}
