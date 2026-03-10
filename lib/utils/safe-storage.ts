/**
 * Safe localStorage wrapper that handles Node.js 25+ server-side localStorage
 * which exists but has broken getItem/setItem methods.
 */
export const safeLocalStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // silently fail on server
    }
  },
};
