import { htmlToText } from "@/lib/html";

// About what search engines show of a title and a description before
// cutting them off. They measure pixels, so these are approximations.
export const TITLE_LIMIT = 60;
export const DESCRIPTION_LIMIT = 160;

/** The text of a form value: strings as they are, HTML as its text. */
export function snippetText(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value !== "string") {
    return "";
  }

  const text = /<[a-z][\s\S]*>/i.test(value) ? htmlToText(value) : value;

  return text.replace(/\s+/g, " ").trim();
}

/**
 * The text cut off at the limit the way a search engine cuts it: at a
 * word, with an ellipsis.
 */
export function cutOff(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  const cut = text.slice(0, limit + 1);
  const atWord = cut.lastIndexOf(" ");

  return `${(atWord > limit / 2 ? cut.slice(0, atWord) : cut.slice(0, limit)).trimEnd()} …`;
}

/** The page's URL: the base URL and the path or slug, joined with one slash. */
export function joinUrl(
  base: string | null | undefined,
  path: unknown,
): string {
  const start = (base ?? "").trim();
  const end =
    typeof path === "string" || typeof path === "number"
      ? String(path).trim()
      : "";

  if (!end) {
    return start;
  }

  if (!start) {
    return end;
  }

  return `${start.replace(/\/+$/, "")}/${end.replace(/^\/+/, "")}`;
}

/**
 * A URL as search engines show it: the host, then the path's parts
 * separated by › (the breadcrumb style), without the scheme.
 */
export function displayUrl(url: string): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const parts = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });

  return [parsed.host, ...parts].join(" › ");
}
