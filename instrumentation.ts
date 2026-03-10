/**
 * Next.js instrumentation file - runs once when the server starts.
 * Polyfills localStorage for Node.js 25+ which exposes a broken
 * localStorage global when --localstorage-file has no valid path.
 */
export async function register() {
  if (typeof window === 'undefined') {
    // Server-side: patch localStorage with a no-op in-memory implementation
    const storage = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      get length() { return storage.size; },
      key: (index: number) => [...storage.keys()][index] ?? null,
    };
  }
}
