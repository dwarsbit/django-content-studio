import { cn } from "@/lib/utils";

/**
 * The glyph of a relation display: one of avatar, initials or icon, in that
 * priority order. Initials render as the first character on a colored
 * circle; the color is derived deterministically from the full initials
 * value, so the same initials always get the same color.
 */

// Static classes so Tailwind includes them in the build.
const GLYPH_COLORS = [
  "bg-red-100 text-red-600",
  "bg-orange-100 text-orange-600",
  "bg-amber-100 text-amber-600",
  "bg-green-100 text-green-600",
  "bg-teal-100 text-teal-600",
  "bg-sky-100 text-sky-600",
  "bg-indigo-100 text-indigo-600",
  "bg-purple-100 text-purple-600",
  "bg-pink-100 text-pink-600",
];

export function colorForInitials(initials: string): string {
  let hash = 0;

  for (let i = 0; i < initials.length; i++) {
    hash = (hash * 31 + initials.charCodeAt(i)) | 0;
  }

  return GLYPH_COLORS[Math.abs(hash) % GLYPH_COLORS.length];
}

export function RelationGlyph({
  avatar,
  initials,
  icon,
  size,
  text,
}: {
  avatar?: string | null;
  initials?: string | null;
  icon?: string | null;
  /** Box classes, e.g. "size-6". */
  size?: string;
  /** Text size for the initials circle, e.g. "text-xs". */
  text?: string;
}) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt=""
        className={cn(size, "rounded-full object-cover shrink-0")}
      />
    );
  }

  if (initials) {
    return (
      <span
        className={cn(
          size,
          colorForInitials(initials),
          "rounded-full flex items-center justify-center shrink-0 font-bold select-none",
          text,
        )}
      >
        {initials.charAt(0).toUpperCase()}
      </span>
    );
  }

  if (icon) {
    // The icon glyph inherits the surrounding font size, like the menu
    // icons, and is centered within its box.
    return (
      <span
        className={cn(
          icon,
          size,
          "flex items-center justify-center shrink-0 text-muted-foreground",
        )}
      />
    );
  }

  return null;
}
