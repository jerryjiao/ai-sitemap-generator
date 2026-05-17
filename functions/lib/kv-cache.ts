/**
 * KV cache wrapper for Cloudflare Workers KV namespace.
 * Provides simple get/set/delete with optional TTL.
 */

/**
 * Retrieve a cached value by key.
 *
 * @param kv    - The KV namespace binding
 * @param key   - Cache key (must be non-empty string, max 512 bytes)
 * @returns     The cached string value, or null if not found / expired
 */
export async function getCached(
  kv: KVNamespace,
  key: string
): Promise<string | null> {
  if (!key || typeof key !== 'string') {
    throw new Error('Cache key must be a non-empty string');
  }
  if (key.length > 512) {
    throw new Error('Cache key must not exceed 512 characters');
  }
  return kv.get(key, 'text');
}

/**
 * Store a value in cache with an optional TTL.
 *
 * @param kv          - The KV namespace binding
 * @param key         - Cache key (must be non-empty string, max 512 bytes)
 * @param value       - The string value to cache
 * @param ttlSeconds  - Time-to-live in seconds (default 3600 = 1 hour, min 60, max 2592000)
 */
export async function setCache(
  kv: KVNamespace,
  key: string,
  value: string,
  ttlSeconds: number = 3600
): Promise<void> {
  if (!key || typeof key !== 'string') {
    throw new Error('Cache key must be a non-empty string');
  }
  if (key.length > 512) {
    throw new Error('Cache key must not exceed 512 characters');
  }
  if (typeof value !== 'string') {
    throw new Error('Cache value must be a string');
  }
  const clampedTtl = Math.max(60, Math.min(2592000, ttlSeconds));
  await kv.put(key, value, { expirationTtl: clampedTtl });
}

/**
 * Delete a cached value by key.
 *
 * @param kv    - The KV namespace binding
 * @param key   - Cache key to delete
 */
export async function deleteCache(
  kv: KVNamespace,
  key: string
): Promise<void> {
  if (!key || typeof key !== 'string') {
    throw new Error('Cache key must be a non-empty string');
  }
  await kv.delete(key);
}
