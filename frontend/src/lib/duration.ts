/**
 * DurationField values as the API writes them: "[D ]HH:MM:SS[.ffffff]"
 * (Django's duration_string), split into the DurationWidget's boxes and
 * back.
 */

export interface DurationParts {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
}

export const EMPTY_DURATION: DurationParts = {
  days: "",
  hours: "",
  minutes: "",
  seconds: "",
};

const DURATION = /^(?:(\d+) (?:days?, )?)?(\d+):(\d{1,2}):(\d{1,2})(?:\.\d+)?$/;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The boxes of a duration; with showDays false, the days count as
 * hours. Null for an empty or unreadable value (a negative duration).
 */
export function parseDuration(
  value: string | null | undefined,
  showDays: boolean,
): DurationParts | null {
  const match = DURATION.exec((value ?? "").trim());

  if (!match) {
    return null;
  }
  const [, days = "0", hours, minutes, seconds] = match;
  const totalHours = Number(days) * 24 + Number(hours);

  return {
    days: showDays ? String(Number(days)) : "",
    hours: String(showDays ? Number(hours) : totalHours),
    minutes: pad(Number(minutes)),
    seconds: pad(Number(seconds)),
  };
}

/**
 * The value of the boxes: "D HH:MM:SS", or "HH:MM:SS" without days.
 * Empty boxes count as 0; all shown boxes empty is no duration (null).
 */
export function formatDuration(
  parts: DurationParts,
  shown: (keyof DurationParts)[] = ["days", "hours", "minutes", "seconds"],
): string | null {
  if (shown.every((unit) => parts[unit] === "")) {
    return null;
  }
  const number = (part: string) => Number(part) || 0;
  let seconds = number(parts.seconds);
  let minutes = number(parts.minutes) + Math.floor(seconds / 60);
  let hours = number(parts.hours) + Math.floor(minutes / 60);
  const days = number(parts.days) + Math.floor(hours / 24);
  seconds %= 60;
  minutes %= 60;
  hours %= 24;

  const time = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return days ? `${days} ${time}` : time;
}
