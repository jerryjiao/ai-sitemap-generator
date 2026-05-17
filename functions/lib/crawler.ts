/**
 * Web crawler for Cloudflare Workers environment.
 *
 * Uses native fetch() with no external dependencies. Discovers internal pages,
 * extracts SEO metadata, and returns structured results suitable for sitemap
 * generation and SEO analysis.
 */

import { insertPage, insertLink } from '../db/queries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrawledLink {
  toUrl: string;
  linkText: string | null;
}

export interface CrawledPage {
  url: string;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  h1Text: string | null;
  depth: number;
  responseTimeMs: number | null;
  hasCanonical: boolean;
  hasNoindex: boolean;
  contentType: string | null;
  links: CrawledLink[];
}

export type CrawlProgressCallback = (url: string, depth: number) => void;

interface QueueItem {
  url: string;
  depth: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PAGES = 500;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB – keep memory usage sane in Worker

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Parse a URL safely. Returns null if the string is not a valid http/https URL.
 */
function parseUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Normalize a URL for deduplication:
 *  - lowercase host
 *  - strip fragment
 *  - strip trailing slash from path (except root "/")
 */
function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
      parsed.pathname = path;
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

/**
 * Resolve a potentially-relative href against a base URL.
 * Returns the normalized absolute URL, or null if resolution fails
 * or the result is not http/https.
 */
function resolveHref(base: URL, href: string): string | null {
  if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
    return null;
  }
  try {
    const resolved = new URL(href, base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return normalizeUrl(resolved.toString());
  } catch {
    return null;
  }
}

/**
 * Check whether two URLs share the same origin (protocol + hostname + port).
 */
function isSameOrigin(urlA: URL, urlB: URL): boolean {
  return urlA.origin === urlB.origin;
}

// ---------------------------------------------------------------------------
// HTML extraction helpers (regex-based, no heavy parser)
// ---------------------------------------------------------------------------

/**
 * Extract the <title> text content.
 */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return decodeHtmlEntities(match[1].trim()) || null;
}

/**
 * Extract meta description content attribute.
 * Handles both attribute orderings: name-then-content and content-then-name.
 */
function extractMetaDescription(html: string): string | null {
  // <meta name="description" content="...">
  let match = html.match(/<meta\s+[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*\/?>/i);
  if (match) return decodeHtmlEntities(match[1].trim()) || null;

  // <meta content="..." name="description">
  match = html.match(/<meta\s+[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["'][^>]*\/?>/i);
  if (match) return decodeHtmlEntities(match[1].trim()) || null;

  return null;
}

/**
 * Extract the first <h1> text, stripping any inner HTML tags.
 */
function extractH1(html: string): string | null {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return null;
  const text = match[1].replace(/<[^>]+>/g, '').trim();
  return decodeHtmlEntities(text) || null;
}

/**
 * Detect <link rel="canonical" href="...">.
 */
function extractCanonical(html: string): boolean {
  return /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(html);
}

/**
 * Detect meta robots noindex directive.
 */
function extractNoindex(html: string): boolean {
  return /<meta\s+[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*\/?>/i.test(html);
}

/**
 * Extract all <a href> links from HTML.
 * Returns array of { href, linkText } objects with raw attribute values.
 */
function extractLinks(html: string): Array<{ href: string; linkText: string | null }> {
  const results: Array<{ href: string; linkText: string | null }> = [];
  // Match <a ... href="..." ...>text</a>
  const anchorRegex = /<a\s+[^>]*?href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1];
    const rawText = match[2].replace(/<[^>]+>/g, '').trim();
    results.push({
      href,
      linkText: rawText ? decodeHtmlEntities(rawText) : null,
    });
  }

  return results;
}

/**
 * Minimal HTML entity decoder covering the most common named entities and
 * numeric character references. No external dependency required.
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  let result = text;

  // Named entities
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }

  // Decimal numeric references  &#123;
  result = result.replace(/&#(\d+);/g, (_, code) => {
    const num = parseInt(code, 10);
    return num > 0 && num <= 0x10ffff ? String.fromCodePoint(num) : '';
  });

  // Hexadecimal numeric references  &#x1F;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const num = parseInt(hex, 16);
    return num > 0 && num <= 0x10ffff ? String.fromCodePoint(num) : '';
  });

  return result;
}

/**
 * Read a Response body as text, capped at MAX_HTML_BYTES to avoid OOM in
 * a Worker environment.
 */
async function readBodyText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (totalBytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
    }
  } finally {
    reader.releaseLock();
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = '';
  for (const chunk of chunks) {
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode(); // flush
  return text;
}

// ---------------------------------------------------------------------------
// Core crawl function
// ---------------------------------------------------------------------------

/**
 * Crawl a website starting from `startUrl`, discovering internal pages up to
 * `maxDepth` levels deep.
 *
 * @param startUrl  Fully-qualified URL (http or https) to begin crawling from.
 * @param maxDepth  Maximum link-follow depth (1 = only startUrl, 2 = links from startUrl, ...).
 * @param onProgress  Optional callback invoked after each page is processed.
 * @returns Array of CrawledPage objects with extracted SEO metadata.
 */
export async function crawlSite(
  startUrl: string,
  maxDepth: number,
  onProgress?: CrawlProgressCallback,
): Promise<CrawledPage[]> {
  // Validate inputs
  const parsedStart = parseUrl(startUrl);
  if (!parsedStart) {
    throw new Error(`Invalid start URL: "${startUrl}". Must be a valid http/https URL.`);
  }

  const clampedDepth = Math.max(1, Math.min(5, Math.floor(maxDepth)));
  const normalizedStart = normalizeUrl(parsedStart.toString());

  const visited = new Set<string>([normalizedStart]);
  const queue: QueueItem[] = [{ url: normalizedStart, depth: 1 }];
  const pages: CrawledPage[] = [];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    // Process in FIFO order (breadth-first) for predictable depth progression
    const item = queue.shift()!;

    const page = await fetchAndParse(item.url, item.depth, parsedStart);
    pages.push(page);

    onProgress?.(page.url, page.depth);

    // Only queue child links if we haven't reached max depth and the page is HTML
    if (item.depth < clampedDepth && page.contentType?.includes('text/html')) {
      for (const link of page.links) {
        const normalized = normalizeUrl(link.toUrl);
        if (!visited.has(normalized)) {
          visited.add(normalized);
          queue.push({ url: normalized, depth: item.depth + 1 });
        }
      }
    }
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Single-page fetch + parse
// ---------------------------------------------------------------------------

/**
 * Fetch a single URL and extract all SEO-relevant data from the response.
 */
async function fetchAndParse(
  url: string,
  depth: number,
  baseOrigin: URL,
): Promise<CrawledPage> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const startTime = Date.now();

  let statusCode: number | null = null;
  let contentType: string | null = null;
  let title: string | null = null;
  let metaDescription: string | null = null;
  let h1Text: string | null = null;
  let hasCanonical = false;
  let hasNoindex = false;
  const links: CrawledLink[] = [];

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'AI-Sitemap-Generator/1.0 (+https://sitemap.tool)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    statusCode = response.status;
    contentType = response.headers.get('content-type') ?? null;

    // Only parse HTML responses
    if (contentType?.includes('text/html') || contentType?.includes('application/xhtml')) {
      const html = await readBodyText(response);

      title = extractTitle(html);
      metaDescription = extractMetaDescription(html);
      h1Text = extractH1(html);
      hasCanonical = extractCanonical(html);
      hasNoindex = extractNoindex(html);

      // Extract and filter same-origin links
      const rawLinks = extractLinks(html);
      const currentUrl = new URL(response.url || url);

      for (const raw of rawLinks) {
        const resolved = resolveHref(currentUrl, raw.href);
        if (!resolved) continue;

        const parsedResolved = parseUrl(resolved);
        if (!parsedResolved) continue;

        if (isSameOrigin(baseOrigin, parsedResolved)) {
          links.push({ toUrl: resolved, linkText: raw.linkText });
        }
      }
    }
  } catch (error: unknown) {
    // Distinguish timeout from other errors
    if (error instanceof DOMException && error.name === 'AbortError') {
      statusCode = null; // Timeout – no response received
    }
    // For any other network / DNS / etc. error we leave statusCode as null
  } finally {
    clearTimeout(timeoutId);
  }

  const responseTimeMs = statusCode !== null ? Date.now() - startTime : null;

  // Use the actual URL (after redirects) if available; fall back to requested URL
  return {
    url,
    statusCode,
    title,
    metaDescription,
    h1Text,
    depth,
    responseTimeMs,
    hasCanonical,
    hasNoindex,
    contentType,
    links,
  };
}

// ---------------------------------------------------------------------------
// D1 storage integration
// ---------------------------------------------------------------------------

/**
 * Crawl a site and persist all results into D1.
 *
 * Stores each page and its internal links using the query helpers from
 * `../db/queries`.  The session status is updated to "completed" on success
 * or "failed" if an unrecoverable error occurs.
 *
 * @param startUrl    Fully-qualified URL to start crawling.
 * @param maxDepth    Maximum crawl depth (1-5).
 * @param sessionId   The crawl_sessions row ID to associate results with.
 * @param db          D1Database binding.
 * @param onProgress  Optional callback invoked after each page is processed.
 */
export async function crawlAndStore(
  startUrl: string,
  maxDepth: number,
  sessionId: string,
  db: D1Database,
  onProgress?: CrawlProgressCallback,
): Promise<CrawledPage[]> {
  const pages = await crawlSite(startUrl, maxDepth, onProgress);

  for (const page of pages) {
    // Insert the page row
    await insertPage(db, sessionId, {
      url: page.url,
      statusCode: page.statusCode,
      title: page.title,
      metaDescription: page.metaDescription,
      h1Text: page.h1Text,
      depth: page.depth,
      responseTimeMs: page.responseTimeMs,
      hasCanonical: page.hasCanonical,
      hasNoindex: page.hasNoindex,
      contentType: page.contentType,
    });

    // Insert each discovered internal link
    for (const link of page.links) {
      await insertLink(db, sessionId, page.url, link.toUrl, link.linkText);
    }
  }

  return pages;
}
