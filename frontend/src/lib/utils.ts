import { type ClassValue, clsx } from "clsx";
import * as R from "ramda";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getErrorMessage = R.pipe(
  R.path(["response", "data"]),
  R.ifElse(Array.isArray, R.head, R.prop("detail")),
  R.defaultTo("Error"),
);

export function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/**
 * Two initials for a name: the first letters of the first and the last
 * word, or the first two letters of a single word.
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
