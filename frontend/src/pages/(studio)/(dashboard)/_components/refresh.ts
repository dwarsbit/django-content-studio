import { type DashboardWidget } from "@/types";

/**
 * The widget's refetch interval for TanStack Query: its
 * `refresh_interval` in milliseconds, or false to only refetch on focus
 * and reconnect.
 */
export function widgetRefetchInterval(widget: DashboardWidget): number | false {
  const seconds = widget.refresh_interval;

  return seconds && seconds > 0 ? seconds * 1000 : false;
}
