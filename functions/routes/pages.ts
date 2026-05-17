/**
 * Pages API route.
 *
 * GET /:sessionId — Retrieve all crawled pages for a session.
 * Transforms D1 snake_case rows into frontend-friendly camelCase objects.
 */

import { Hono } from 'hono';
import { getPagesBySession } from '../db/queries';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

interface PageRow {
  id: string;
  session_id: string;
  url: string;
  status_code: number | null;
  title: string | null;
  meta_description: string | null;
  h1_text: string | null;
  depth: number;
  response_time_ms: number | null;
  has_canonical: number;
  has_noindex: number;
  content_type: string | null;
  discovered_at: string;
}

interface PageResponse {
  id: string;
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
  discoveredAt: string;
}

/**
 * Transform a D1 page row from snake_case to camelCase for the frontend.
 */
function toApiResponse(row: PageRow): PageResponse {
  return {
    id: row.id,
    url: row.url,
    statusCode: row.status_code,
    title: row.title,
    metaDescription: row.meta_description,
    h1Text: row.h1_text,
    depth: row.depth,
    responseTimeMs: row.response_time_ms,
    hasCanonical: Boolean(row.has_canonical),
    hasNoindex: Boolean(row.has_noindex),
    contentType: row.content_type,
    discoveredAt: row.discovered_at,
  };
}

// ---------------------------------------------------------------------------
// GET /:sessionId — Get all crawled pages
// ---------------------------------------------------------------------------

app.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  if (!sessionId || sessionId.trim().length === 0) {
    return c.json({ error: 'Session ID is required' }, 400);
  }

  const rawPages = await getPagesBySession(c.env.DB, sessionId.trim());
  const pages = (rawPages as unknown as PageRow[]).map(toApiResponse);

  return c.json({
    pages,
    total: pages.length,
  });
});

export default app;
