import dayjs from "dayjs";
import { PiCalendarBlankBold } from "react-icons/pi";

export function DateFormat({ value }: { value: unknown }) {
  return typeof value === "string" && dayjs(value).isValid() ? (
    <span className="inline-flex items-center gap-1">
      <PiCalendarBlankBold className="text-muted-foreground" />
      {dayjs(value).format("D MMM YYYY")}
    </span>
  ) : null;
}
