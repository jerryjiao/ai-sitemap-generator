import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import crawlRoutes from './routes/crawl';
import pagesRoutes from './routes/pages';
import sitemapRoutes from './routes/sitemap';
import issuesRoutes from './routes/issues';
import statsRoutes from './routes/stats';
import downloadRoutes from './routes/download';
import aiSettingsRoutes from './routes/ai-settings';
import aiEnhanceRoutes from './routes/ai-enhance';
import exportJsonRoutes from './routes/export-json';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.use('*', cors());
app.use('*', logger());

app.route('/crawl', crawlRoutes);
app.route('/pages', pagesRoutes);
app.route('/sitemap', sitemapRoutes);
app.route('/issues', issuesRoutes);
app.route('/stats', statsRoutes);
app.route('/download', downloadRoutes);
app.route('/ai-settings', aiSettingsRoutes);
app.route('/ai-enhance', aiEnhanceRoutes);
app.route('/export/json', exportJsonRoutes);

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

export { app };
