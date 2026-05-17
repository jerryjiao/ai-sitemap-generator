/**
 * Sitemap API route.
 *
 * GET /:sessionId — Return the generated sitemap XML for a session.
 * Tries R2 first (pre-generated), then falls back to generating on-the-fly
 * from D1 page data.
 */

import { Hono } from 'hono';
import { downloadFromR2 } from '../lib/r2-store';
import { getPagesBySession } from '../db/queries';
import { generateSitemap } from '../lib/sitemap-generator';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /:sessionId — Get sitemap XML
// ---------------------------------------------------------------------------

app.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  if (!sessionId || sessionId.trim().length === 0) {
    return c.json({ error: 'Session ID is required' }, 400);
  }

  const trimmedId = sessionId.trim();

  // Try to fetch the pre-generated sitemap from R2
  const r2Key = `sitemaps/${trimmedId}.xml`;
  const cached = await downloadFromR2(c.env.R2, r2Key);

  if (cached) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // Fallback: generate sitemap on-the-fly from D1 page data
  const rawPages = await getPagesBySession(c.env.DB, trimmedId);

  if (!rawPages || rawPages.length === 0) {
    return c.json({ error: 'No pages found for this session. The crawl may still be in progress.' }, 404);
  }

  const sitemapPages = (rawPages as Array<Record<string, unknown>>).map((row) => ({
    url: row.url as string,
    statusCode: row.status_code as number | null,
    depth: row.depth as number,
  }));

  const sitemapXml = generateSitemap(sitemapPages);

  return new Response(sitemapXml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

export default app;
