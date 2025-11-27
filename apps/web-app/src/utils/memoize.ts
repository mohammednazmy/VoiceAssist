/**
 * Memoization Utilities
 * Cache function results to avoid expensive recalculations
 *
 * Phase 10: Performance & Scalability
 */

/**
 * Simple memoization for single-argument functions
 */
export function memoize<T, R>(fn: (arg: T) => R): (arg: T) => R {
  const cache = new Map<T, R>();

  return (arg: T): R => {
    if (cache.has(arg)) {
      return cache.get(arg)!;
    }

    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
}

/**
 * Memoization with custom cache key generation
 */
export function memoizeWithKey<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  keyFn: (...args: Args) => string,
): (...args: Args) => R {
  const cache = new Map<string, R>();

  return (...args: Args): R => {
    const key = keyFn(...args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * LRU (Least Recently Used) cache memoization
 */
export function memoizeLRU<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  maxSize: number = 100,
  keyFn: (...args: Args) => string = (...args) => JSON.stringify(args),
): (...args: Args) => R {
  const cache = new Map<string, R>();
  const accessOrder: string[] = [];

  return (...args: Args): R => {
    const key = keyFn(...args);

    if (cache.has(key)) {
      // Move to end of access order (most recently used)
      const index = accessOrder.indexOf(key);
      if (index > -1) {
        accessOrder.splice(index, 1);
        accessOrder.push(key);
      }
      return cache.get(key)!;
    }

    const result = fn(...args);

    // Evict least recently used if at capacity
    if (cache.size >= maxSize) {
      const lruKey = accessOrder.shift();
      if (lruKey) {
        cache.delete(lruKey);
      }
    }

    cache.set(key, result);
    accessOrder.push(key);
    return result;
  };
}

/**
 * Time-based expiring cache memoization
 */
export function memoizeWithExpiry<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  ttlMs: number,
  keyFn: (...args: Args) => string = (...args) => JSON.stringify(args),
): (...args: Args) => R {
  const cache = new Map<string, { value: R; expires: number }>();

  return (...args: Args): R => {
    const key = keyFn(...args);
    const now = Date.now();

    const cached = cache.get(key);
    if (cached && cached.expires > now) {
      return cached.value;
    }

    const result = fn(...args);
    cache.set(key, {
      value: result,
      expires: now + ttlMs,
    });

    return result;
  };
}

/**
 * Async function memoization with deduplication
 * Prevents duplicate concurrent calls with the same arguments
 */
export function memoizeAsync<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  keyFn: (...args: Args) => string = (...args) => JSON.stringify(args),
): (...args: Args) => Promise<R> {
  const cache = new Map<string, Promise<R>>();

  return async (...args: Args): Promise<R> => {
    const key = keyFn(...args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const promise = fn(...args).finally(() => {
      // Remove from cache after resolution to allow re-fetch
      cache.delete(key);
    });

    cache.set(key, promise);
    return promise;
  };
}

/**
 * Create a cache that can be manually managed
 */
export function createCache<K, V>() {
  const cache = new Map<K, V>();

  return {
    get: (key: K): V | undefined => cache.get(key),
    set: (key: K, value: V): void => {
      cache.set(key, value);
    },
    has: (key: K): boolean => cache.has(key),
    delete: (key: K): boolean => cache.delete(key),
    clear: (): void => cache.clear(),
    size: (): number => cache.size,
    keys: (): IterableIterator<K> => cache.keys(),
    values: (): IterableIterator<V> => cache.values(),
    entries: (): IterableIterator<[K, V]> => cache.entries(),
  };
}

/**
 * WeakMap-based cache for object keys (auto garbage collection)
 */
export function createWeakCache<K extends object, V>() {
  const cache = new WeakMap<K, V>();

  return {
    get: (key: K): V | undefined => cache.get(key),
    set: (key: K, value: V): void => {
      cache.set(key, value);
    },
    has: (key: K): boolean => cache.has(key),
    delete: (key: K): boolean => cache.delete(key),
  };
}
