/**
 * Issues API route.
 *
 * GET /:sessionId — Retrieve SEO issues detected for a crawl session.
 * Fetches pages and links from D1, runs the SEO analyzer, and returns
 * the sorted issue list.
 */

import { Hono } from 'hono';
import { getPagesBySession, getLinksBySession } from '../db/queries';
import { analyzeSEO } from '../lib/seo-analyzer';
import type { PageData, LinkData } from '../lib/seo-analyzer';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

/**
 * Transform raw D1 page rows into PageData objects for the SEO analyzer.
 */
function toPageData(rows: Array<Record<string, unknown>>): PageData[] {
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
 * Transform raw D1 link rows into LinkData objects for the SEO analyzer.
 */
function toLinkData(rows: Array<Record<string, unknown>>): LinkData[] {
  return rows.map((row) => ({
    fromUrl: row.from_url as string,
    toUrl: row.to_url as string,
    linkText: row.link_text as string | null,
  }));
}

// ---------------------------------------------------------------------------
// GET /:sessionId — Get SEO issues
// ---------------------------------------------------------------------------

app.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  if (!sessionId || sessionId.trim().length === 0) {
    return c.json({ error: 'Session ID is required' }, 400);
  }

  const trimmedId = sessionId.trim();

  const rawPages = await getPagesBySession(c.env.DB, trimmedId);
  const rawLinks = await getLinksBySession(c.env.DB, trimmedId);

  if (!rawPages || rawPages.length === 0) {
    return c.json({ error: 'No pages found for this session' }, 404);
  }

  const pages = toPageData(rawPages as Array<Record<string, unknown>>);
  const links = toLinkData(rawLinks as Array<Record<string, unknown>>);
  const issues = analyzeSEO(pages, links);

  return c.json({ issues });
});

export default app;
