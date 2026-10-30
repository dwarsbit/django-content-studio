/**
 * localStorage that never throws. Browsers that block site data (Safari's
 * "Block all cookies", some embedded webviews) throw a SecurityError on
 * every access; the admin then works without remembering anything.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not remembered.
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  },
};
