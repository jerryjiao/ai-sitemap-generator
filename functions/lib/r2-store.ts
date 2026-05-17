/**
 * R2 storage helpers for Cloudflare Workers R2 bucket.
 * Provides upload, download, and delete for string content (e.g. sitemap XML).
 */

/**
 * Upload a string to R2 as a readable stream.
 *
 * @param r2           - The R2 bucket binding
 * @param key          - Object key (must be non-empty, max 1024 bytes)
 * @param content      - The string content to store
 * @param contentType  - MIME type (default 'application/xml')
 */
export async function uploadToR2(
  r2: R2Bucket,
  key: string,
  content: string,
  contentType: string = 'application/xml'
): Promise<void> {
  if (!key || typeof key !== 'string') {
    throw new Error('R2 object key must be a non-empty string');
  }
  if (key.length > 1024) {
    throw new Error('R2 object key must not exceed 1024 characters');
  }
  if (typeof content !== 'string') {
    throw new Error('R2 content must be a string');
  }
  if (typeof contentType !== 'string' || !contentType) {
    throw new Error('Content type must be a non-empty string');
  }

  await r2.put(key, content, {
    httpMetadata: { contentType },
  });
}

/**
 * Download a string from R2 by key.
 *
 * @param r2   - The R2 bucket binding
 * @param key  - Object key to retrieve
 * @returns    The stored string content, or null if the object does not exist
 */
export async function downloadFromR2(
  r2: R2Bucket,
  key: string
): Promise<string | null> {
  if (!key || typeof key !== 'string') {
    throw new Error('R2 object key must be a non-empty string');
  }

  const object = await r2.get(key);
  if (!object) {
    return null;
  }

  return object.text();
}

/**
 * Delete an object from R2 by key.
 *
 * @param r2   - The R2 bucket binding
 * @param key  - Object key to delete
 */
export async function deleteFromR2(
  r2: R2Bucket,
  key: string
): Promise<void> {
  if (!key || typeof key !== 'string') {
    throw new Error('R2 object key must be a non-empty string');
  }
  await r2.delete(key);
}
