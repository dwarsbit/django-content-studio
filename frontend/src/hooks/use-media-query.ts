import { useEffect, useState } from "react";

/**
 * Whether a media query matches, kept in sync with the viewport. Without
 * matchMedia (jsdom) nothing matches.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia?.(query).matches ?? false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);

    onChange();
    list.addEventListener("change", onChange);

    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Below this width the main menu is always the rail of icons.
export const NARROW_QUERY = "(max-width: 1023px)";
