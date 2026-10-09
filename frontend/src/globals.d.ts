declare module "@fontsource-variable/*" {}

interface Window {
  /** Set by the Django template when DEBUG is on; enables dev-only UIs. */
  DCS_DEBUG?: boolean;
  /** Static asset prefix, set by the Django template. */
  DCS_STATIC_PREFIX?: string;
}
