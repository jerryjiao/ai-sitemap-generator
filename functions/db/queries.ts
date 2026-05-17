import { v4 as uuid } from 'uuid';

interface Env {
  DB: D1Database;
}

export async function createSession(db: D1Database, domain: string, startUrl: string, maxDepth: number) {
  const id = uuid();
  await db.prepare(
    'INSERT INTO crawl_sessions (id, domain, start_url, max_depth, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, domain, startUrl, maxDepth, 'pending').run();
  return id;
}

export async function updateSessionStatus(db: D1Database, id: string, status: string) {
  const completedAt = status === 'completed' || status === 'failed' ? new Date().toISOString() : null;
  if (completedAt) {
    await db.prepare(
      'UPDATE crawl_sessions SET status = ?, completed_at = ? WHERE id = ?'
    ).bind(status, completedAt, id).run();
  } else {
    await db.prepare(
      'UPDATE crawl_sessions SET status = ? WHERE id = ?'
    ).bind(status, id).run();
  }
}

export async function getSession(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM crawl_sessions WHERE id = ?').bind(id).first();
}

export async function insertPage(db: D1Database, sessionId: string, page: {
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
}) {
  const id = uuid();
  await db.prepare(
    `INSERT OR IGNORE INTO pages (id, session_id, url, status_code, title, meta_description, h1_text, depth, response_time_ms, has_canonical, has_noindex, content_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, sessionId, page.url, page.statusCode, page.title,
    page.metaDescription, page.h1Text, page.depth, page.responseTimeMs,
    page.hasCanonical ? 1 : 0, page.hasNoindex ? 1 : 0, page.contentType
  ).run();
}

export async function insertLink(db: D1Database, sessionId: string, fromUrl: string, toUrl: string, linkText: string | null) {
  const id = uuid();
  await db.prepare(
    'INSERT INTO internal_links (id, session_id, from_url, to_url, link_text) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, sessionId, fromUrl, toUrl, linkText).run();
}

export async function getPagesBySession(db: D1Database, sessionId: string) {
  const { results } = await db.prepare(
    'SELECT * FROM pages WHERE session_id = ? ORDER BY depth, url'
  ).bind(sessionId).all();
  return results;
}

export async function getLinksBySession(db: D1Database, sessionId: string) {
  const { results } = await db.prepare(
    'SELECT * FROM internal_links WHERE session_id = ?'
  ).bind(sessionId).all();
  return results;
}

export async function getPageCountBySession(db: D1Database, sessionId: string) {
  const result = await db.prepare(
    'SELECT COUNT(*) as count FROM pages WHERE session_id = ?'
  ).bind(sessionId).first();
  return (result as { count: number })?.count ?? 0;
}
