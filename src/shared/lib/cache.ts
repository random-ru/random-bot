type CacheKey = string | number | object

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

interface Options {
  ttl: number
}

export function createMemoryCache<T>(options: Options) {
  const cache = new Map<CacheKey, CacheEntry<T>>()

  function get(key: CacheKey): T | null {
    const entry = cache.get(key)

    if (!entry) {
      return null
    }

    if (entry.expiresAt < Date.now()) {
      cache.delete(key)
      return null
    }

    return entry.value
  }

  function set(key: CacheKey, value: T) {
    cache.set(key, {
      value,
      expiresAt: Date.now() + options.ttl,
    })
  }

  function deleteEntry(key: CacheKey) {
    cache.delete(key)
  }

  function clear() {
    cache.clear()
  }

  return {
    get,
    set,
    delete: deleteEntry,
    clear,
  }
}
