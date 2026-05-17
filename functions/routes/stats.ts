/**
 * Stats API route.
 *
 * GET /:sessionId — Compute and return aggregate statistics for a crawl session:
 * total pages, status code distribution, depth metrics, response time, and
 * issue counts by severity.
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
// GET /:sessionId — Get statistics
// ---------------------------------------------------------------------------

app.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  if (!sessionId || sessionId.trim().length === 0) {
    return c.json({ error: 'Session ID is required' }, 400);
  }

  const trimmedId = sessionId.trim();

  const rawPages = await getPagesBySession(c.env.DB, trimmedId);

  if (!rawPages || rawPages.length === 0) {
    return c.json({ error: 'No pages found for this session' }, 404);
  }

  const pages = rawPages as Array<Record<string, unknown>>;

  // Total pages
  const totalPages = pages.length;

  // Status code distribution
  const statusDistribution: Record<string, number> = {};
  for (const page of pages) {
    const code = page.status_code;
    const key = code !== null ? String(code) : 'unknown';
    statusDistribution[key] = (statusDistribution[key] || 0) + 1;
  }

  // Depth metrics
  const depths = pages.map((p) => (p.depth as number) || 0);
  const maxDepth = Math.max(...depths);
  const avgDepth = totalPages > 0
    ? Math.round((depths.reduce((sum, d) => sum + d, 0) / totalPages) * 100) / 100
    : 0;

  // Response time metrics (only for pages that have a response time)
  const responseTimes = pages
    .map((p) => p.response_time_ms as number | null)
    .filter((t): t is number => t !== null && t > 0);
  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length)
    : null;

  // Issue counts — run SEO analysis
  const rawLinks = await getLinksBySession(c.env.DB, trimmedId);
  const pageData = toPageData(pages);
  const linkData = toLinkData(rawLinks as Array<Record<string, unknown>>);
  const issues = analyzeSEO(pageData, linkData);

  const issueCounts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    if (issue.severity === 'error') issueCounts.error++;
    else if (issue.severity === 'warning') issueCounts.warning++;
    else issueCounts.info++;
  }

  return c.json({
    totalPages,
    statusDistribution,
    avgDepth,
    maxDepth,
    avgResponseTime,
    issueCounts,
  });
});

export default app;
