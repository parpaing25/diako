/**
 * Fonenako — Cache mémoire léger pour les données du feed
 * Pattern stale-while-revalidate : affiche le cache instantanément, refresh en arrière-plan
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const MAX_AGE = 5 * 60 * 1000; // 5 minutes

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  // Retourner même si expiré — on refresh en arrière-plan
  return entry.data;
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
  getListings: (): any[] | null => getCached('feed_listings'),
  setListings: (data: any[]) => setCached('feed_listings', data),
  isFresh: () => isFresh('feed_listings'),
};

// Cache pour les détails d'une annonce
export const listingCache = {
  get: (id: string): any | null => getCached(`listing_${id}`),
  set: (id: string, data: any) => setCached(`listing_${id}`, data),
};
