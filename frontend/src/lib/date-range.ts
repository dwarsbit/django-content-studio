import dayjs from "dayjs";

/**
 * A bound of the date range: a plain date for a DateField; for a
 * DateTimeField, the first or last instant of the picked day in the
 * browser's time zone (the one the list shows times in), with its
 * offset so the server reads that instant.
 */
export function dateRangeBound(
  date: Date,
  lookup: "gte" | "lte",
  isDateTime: boolean,
) {
  if (!isDateTime) {
    return dayjs(date).format("YYYY-MM-DD");
  }

  const day = dayjs(date);

  return (
    lookup === "gte" ? day.startOf("day") : day.endOf("day")
  ).toISOString();
}
