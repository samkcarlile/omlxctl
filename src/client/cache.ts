// Short-TTL in-memory cache to collapse redundant GET fetches within one process lifetime.

interface CacheEntry<T> {
  value: T;
  ts: number;
}

// Module-level store — no eviction needed; short TTLs are sufficient.
const _store = new Map<string, CacheEntry<unknown>>();

/**
 * Wraps `fn` so that calls with the same key+args are deduplicated within ttlMs.
 * Key is scoped per call: `${key}:${JSON.stringify(args)}`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withCache<A extends any[], T>(
  fn: (...args: A) => Promise<T>,
  key: string,
  ttlMs: number = 500,
): (...args: A) => Promise<T> {
  return async (...args: A): Promise<T> => {
    const fullKey = `${key}:${JSON.stringify(args)}`;
    const entry = _store.get(fullKey) as CacheEntry<T> | undefined;
    if (entry !== undefined && Date.now() - entry.ts < ttlMs) {
      return entry.value;
    }
    const value = await fn(...args);
    _store.set(fullKey, { value, ts: Date.now() });
    return value;
  };
}

/**
 * Remove all entries whose key starts with `keyPrefix`.
 * Used by action methods after mutations.
 */
export function invalidateCache(keyPrefix: string): void {
  for (const k of _store.keys()) {
    if (k.startsWith(keyPrefix)) {
      _store.delete(k);
    }
  }
}

/** Drop every cached entry. */
export function clearAllCache(): void {
  _store.clear();
}
