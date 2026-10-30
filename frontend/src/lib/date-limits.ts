import dayjs from "dayjs";
import type { Matcher } from "react-day-picker";

import type { DateWidgetOptions } from "@/types";

/**
 * A date widget's min_date and max_date as calendar props: the days
 * outside them are disabled, and the months outside them unreachable.
 */
export function getDateLimits({ min_date, max_date }: DateWidgetOptions = {}) {
  const min = min_date ? dayjs(min_date, "YYYY-MM-DD").toDate() : undefined;
  const max = max_date ? dayjs(max_date, "YYYY-MM-DD").toDate() : undefined;
  const disabled: Matcher[] = [];

  if (min) {
    disabled.push({ before: min });
  }
  if (max) {
    disabled.push({ after: max });
  }

  return {
    disabled: disabled.length ? disabled : undefined,
    startMonth: min,
    endMonth: max,
  };
}
