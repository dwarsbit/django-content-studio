import axios from "axios";

const BASENAME = (
  window as Window & typeof globalThis & { DCS_BASENAME: string }
).DCS_BASENAME;

/**
 * The shared axios instance every API request goes through. Exported
 * directly for use outside React (the hook is the idiomatic access inside
 * components).
 */
export const http = axios.create({
  baseURL: `${BASENAME}api`,
});

export function useHttp() {
  return http;
}
