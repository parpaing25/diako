/**
 * Fonenako — Cache mémoire léger pour les données du feed
 * Pattern stale-while-revalidate : affiche le cache instantanément, refresh en arrière-plan
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// `unknown` et non `any` : le cache ne connait pas ce qu'il garde, mais
// l'appelant doit le declarer en le relisant. `any` desactive la
// verification EN AVAL, chez chaque appelant, sans qu'aucun le sache.
const cache = new Map<string, CacheEntry<unknown>>();
const MAX_AGE = 5 * 60 * 1000; // 5 minutes

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  // Retourner même si expiré — on refresh en arrière-plan.
  // ⚠ La conversion est ici, en UN endroit, et l'appelant déclare ce qu'il
  //   attend. Avec `any` dans la Map, la vérification tombait chez CHAQUE
  //   appelant sans qu'aucun le sache.
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function isFresh(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < MAX_AGE;
}

export function clearCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) cache.delete(key);
  }
}

// Cache spécifique pour les listings du feed
export const feedCache = {
  getListings: <T = unknown>(): T[] | null => getCached<T[]>('feed_listings'),
  setListings: <T = unknown>(data: T[]) => setCached('feed_listings', data),
  isFresh: () => isFresh('feed_listings'),
};

// Cache pour les détails d'une annonce
export const listingCache = {
  get: <T = unknown>(id: string): T | null => getCached<T>(`listing_${id}`),
  set: <T = unknown>(id: string, data: T) => setCached(`listing_${id}`, data),
};
