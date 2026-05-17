/**
 * Crawl API route.
 *
 * POST /  — Start a new crawl session: validate URL, crawl the site, generate
 *           sitemap XML, store in R2, run SEO analysis, and mark session complete.
 * GET  /  — Get crawl session status by query param `sessionId`.
 */

import { Hono } from 'hono';
import { createSession, updateSessionStatus, getSession, getPagesBySession, getLinksBySession } from '../db/queries';
import { crawlAndStore } from '../lib/crawler';
import { generateSitemap } from '../lib/sitemap-generator';
import { uploadToR2 } from '../lib/r2-store';
import { analyzeSEO } from '../lib/seo-analyzer';
import type { PageData, LinkData } from '../lib/seo-analyzer';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

/**
 * Validate that a string is a well-formed http/https URL and return the parsed
 * URL object. Throws with a user-friendly message on failure.
 */
function validateUrl(raw: string): URL {
  if (!raw || typeof raw !== 'string') {
    throw new Error('URL is required');
  }

  const trimmed = raw.trim();

  // Auto-prepend https:// if no protocol is present
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error(`Invalid URL: "${trimmed}". Please enter a valid domain or URL.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported');
  }

  return parsed;
}

/**
 * Validate and clamp maxDepth to the allowed range [1, 5].
 */
function validateMaxDepth(value: unknown): number {
  if (value === undefined || value === null) return 3;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1 || num > 5) {
    throw new Error('maxDepth must be a number between 1 and 5');
  }
  return Math.floor(num);
}

/**
 * Transform raw D1 page rows into the PageData shape expected by analyzeSEO.
 */
function toPageData(rows: Record<string, unknown>[]): PageData[] {
  return rows.map((row) => ({
    url: row.url as string,
    statusCode: row.status_code as number | null,
    title: row.title as string | null,
    metaDescription: row.meta_description as string | null,
    h1Text: row.h1_text as string | null,
    depth: row.depth as number,
    hasCanonical: Boolean(row.has_canonical),
    hasNoindex: Boolean(row.has_noindex),
    contentType: row.content_type as string | null,
  }));
}

/**
 * Transform raw D1 link rows into the LinkData shape expected by analyzeSEO.
 */
function toLinkData(rows: Record<string, unknown>[]): LinkData[] {
  return rows.map((row) => ({
    fromUrl: row.from_url as string,
    toUrl: row.to_url as string,
    linkText: row.link_text as string | null,
  }));
}

// ---------------------------------------------------------------------------
// POST / — Start crawl
// ---------------------------------------------------------------------------

app.post('/', async (c) => {
  let body: { url?: string; maxDepth?: number };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400);
  }

  // Validate inputs
  let parsedUrl: URL;
  try {
    parsedUrl = validateUrl(body.url as string);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  let maxDepth: number;
  try {
    maxDepth = validateMaxDepth(body.maxDepth);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const startUrl = parsedUrl.toString();
  const domain = parsedUrl.hostname;

  // Create session record in D1 (returns the generated session ID)
  const sessionId = await createSession(c.env.DB, domain, startUrl, maxDepth);

  // Mark as running
  await updateSessionStatus(c.env.DB, sessionId, 'running');

  try {
    // Crawl the site and store all pages/links in D1
    const crawledPages = await crawlAndStore(startUrl, maxDepth, sessionId, c.env.DB);

    // Generate sitemap XML
    const sitemapPages = crawledPages.map((page) => ({
      url: page.url,
      statusCode: page.statusCode,
      depth: page.depth,
    }));
    const sitemapXml = generateSitemap(sitemapPages);

    // Store sitemap in R2
    await uploadToR2(
      c.env.R2,
      `sitemaps/${sessionId}.xml`,
      sitemapXml,
      'application/xml'
    );

    // Run SEO analysis (fetch from D1 for consistency with stored data)
    const rawPages = await getPagesBySession(c.env.DB, sessionId);
    const rawLinks = await getLinksBySession(c.env.DB, sessionId);
    analyzeSEO(toPageData(rawPages), toLinkData(rawLinks));

    // Mark session as completed
    await updateSessionStatus(c.env.DB, sessionId, 'completed');

    return c.json({
      sessionId: sessionId,
      status: 'completed',
      message: `Crawl complete. Found ${crawledPages.length} pages.`,
      totalPages: crawledPages.length,
    });
  } catch (err) {
    // Mark session as failed
    await updateSessionStatus(c.env.DB, sessionId, 'failed');

    const message = err instanceof Error ? err.message : 'An unexpected error occurred during crawling';

    return c.json({
      sessionId: sessionId,
      status: 'failed',
      message,
    }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET / — Get session status
// ---------------------------------------------------------------------------

app.get('/', async (c) => {
  const sessionId = c.req.query('sessionId');

  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return c.json({ error: 'Query parameter "sessionId" is required' }, 400);
  }

  const session = await getSession(c.env.DB, sessionId.trim());

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({ session });
});

export default app;
