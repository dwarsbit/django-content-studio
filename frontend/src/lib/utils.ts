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

/**
 * The path to go to after signing in: a router-relative path from the
 * `redirect` parameter, or `/`. Only a same-origin path is accepted: it
 * starts with a single `/`, so `//host`, `/\host` and anything with a
 * scheme (`javascript:`, `https:`) fall back to `/`, as does a path with
 * control characters, which browsers strip when they parse a URL.
 */
export function safeRedirectPath(redirect: string | null): string {
  if (
    !redirect ||
    !/^\/(?![/\\])/.test(redirect) ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001F\u007F]/.test(redirect)
  ) {
    return "/";
  }

  return redirect;
}
