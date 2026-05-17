/**
 * Export JSON API route.
 *
 * GET /:sessionId — Export a complete crawl report as JSON.
 * Queries D1 for session metadata, pages, links, runs SEO analysis,
 * computes stats, and returns everything in a single downloadable JSON file.
 */

import { Hono } from 'hono';
import { getSession, getPagesBySession, getLinksBySession } from '../db/queries';
import { analyzeSEO } from '../lib/seo-analyzer';
import type { PageData, LinkData } from '../lib/seo-analyzer';
import { downloadFromR2 } from '../lib/r2-store';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

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

function toLinkData(rows: Array<Record<string, unknown>>): LinkData[] {
  return rows.map((row) => ({
    fromUrl: row.from_url as string,
    toUrl: row.to_url as string,
    linkText: row.link_text as string | null,
  }));
}

app.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  if (!sessionId || sessionId.trim().length === 0) {
    return c.json({ error: 'Session ID is required' }, 400);
  }

  const trimmedId = sessionId.trim();

  const session = await getSession(c.env.DB, trimmedId);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const rawPages = await getPagesBySession(c.env.DB, trimmedId);
  if (!rawPages || rawPages.length === 0) {
    return c.json({ error: 'No pages found for this session' }, 404);
  }

  const pages = rawPages as Array<Record<string, unknown>>;
  const rawLinks = await getLinksBySession(c.env.DB, trimmedId);

  // SEO analysis
  const pageData = toPageData(pages);
  const linkData = toLinkData(rawLinks as Array<Record<string, unknown>>);
  const issues = analyzeSEO(pageData, linkData);

  // Stats
  const totalPages = pages.length;
  const statusDistribution: Record<string, number> = {};
  for (const page of pages) {
    const code = page.status_code;
    const key = code !== null ? String(code) : 'unknown';
    statusDistribution[key] = (statusDistribution[key] || 0) + 1;
  }
  const depths = pages.map((p) => (p.depth as number) || 0);
  const maxDepth = Math.max(...depths);
  const avgDepth = totalPages > 0
    ? Math.round((depths.reduce((sum, d) => sum + d, 0) / totalPages) * 100) / 100
    : 0;
  const issueCounts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    if (issue.severity === 'error') issueCounts.error++;
    else if (issue.severity === 'warning') issueCounts.warning++;
    else issueCounts.info++;
  }

  // Try to get sitemap XML from R2
  const r2Key = `sitemaps/${trimmedId}.xml`;
  const sitemapXml = await downloadFromR2(c.env.R2, r2Key);

  const report = {
    sessionId: trimmedId,
    url: session.start_url as string,
    domain: session.domain as string,
    maxDepth: session.max_depth as number,
    status: session.status as string,
    crawledAt: session.completed_at as string | null,
    pages: pageData.map((p) => ({
      url: p.url,
      statusCode: p.statusCode,
      title: p.title,
      metaDescription: p.metaDescription,
      h1: p.h1Text,
      depth: p.depth,
      hasCanonical: p.hasCanonical,
      hasNoindex: p.hasNoindex,
      contentType: p.contentType,
    })),
    stats: {
      totalPages,
      statusDistribution,
      avgDepth,
      maxDepth,
      issueCounts,
    },
    issues,
    sitemapXml: sitemapXml || null,
  };

  return new Response(JSON.stringify(report, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="sitemap-export-${trimmedId}.json"`,
      'Cache-Control': 'no-cache',
    },
  });
});

export default app;
