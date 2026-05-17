/**
 * Download API route.
 *
 * GET /:sessionId — Download the generated sitemap.xml file for a session.
 * Retrieves the file from R2 and serves it as an attachment download.
 */

import { Hono } from 'hono';
import { downloadFromR2 } from '../lib/r2-store';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /:sessionId — Download sitemap.xml
// ---------------------------------------------------------------------------

app.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  if (!sessionId || sessionId.trim().length === 0) {
    return c.json({ error: 'Session ID is required' }, 400);
  }

  const trimmedId = sessionId.trim();
  const r2Key = `sitemaps/${trimmedId}.xml`;

  const content = await downloadFromR2(c.env.R2, r2Key);

  if (!content) {
    return c.json({ error: 'Sitemap file not found. The crawl may not have completed yet.' }, 404);
  }

  return new Response(content, {
    headers: {
      'Content-Type': 'application/xml',
      'Content-Disposition': 'attachment; filename="sitemap.xml"',
      'Cache-Control': 'no-cache',
    },
  });
});

export default app;
