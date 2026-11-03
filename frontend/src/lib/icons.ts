// The prefix of a saved icon class, such as "ph-bold ph-star".
export const ICON_PREFIX = "ph-bold ph-";

/** The icon names in the icon font's stylesheet, sorted. */
export function parseIconNames(css: string): string[] {
  const names = new Set<string>();

  for (const match of css.matchAll(/\.ph-bold\.ph-([a-z0-9-]+):before/g)) {
    names.add(match[1]);
  }

  return [...names].sort();
}

/** The icon name of a saved class, such as "star" for "ph-bold ph-star". */
export function iconName(value: string | null | undefined): string | null {
  return value?.startsWith(ICON_PREFIX)
    ? value.slice(ICON_PREFIX.length)
    : null;
}

/** Whether an icon matches a search: every word is in its name. */
export function matchesIcon(name: string, search: string): boolean {
  const words = search
    .toLowerCase()
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  return words.every((word) => name.includes(word));
}
