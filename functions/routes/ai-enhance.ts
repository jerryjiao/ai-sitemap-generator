/**
 * AI Enhancement API route.
 *
 * POST / — Use AI (BYOK) to generate smart suggestions for a crawl session.
 * Supported features:
 *   - priority:           Smart <priority> suggestions per URL
 *   - changefreq:         Smart <changefreq> suggestions
 *   - content-suggestions: Missing content page suggestions
 *   - url-tips:           URL structure optimization tips
 *
 * Requires that the user has previously configured an AI provider and key
 * via the /api/ai-settings endpoint.
 */

import { Hono } from 'hono';
import { decrypt } from '../lib/crypto';
import { callAI, type AIProvider } from '../lib/ai-adapter';
import { getPagesBySession } from '../db/queries';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

const ENCRYPTION_SECRET = 'ai-sitemap-encryption-key-v1';

const VALID_FEATURES = ['priority', 'changefreq', 'content-suggestions', 'url-tips'] as const;
type Feature = (typeof VALID_FEATURES)[number];

function isValidFeature(value: string): value is Feature {
  return VALID_FEATURES.includes(value as Feature);
}

/**
 * Build the AI prompt for a given feature type, incorporating page data context.
 */
function buildPrompt(feature: Feature, pages: Array<Record<string, unknown>>): string {
  // Summarize page data for the prompt (limit to first 50 pages to stay within token limits)
  const pageSummaries = pages.slice(0, 50).map((p) => ({
    url: p.url,
    title: p.title,
    depth: p.depth,
    statusCode: p.status_code,
  }));

  const siteContext = JSON.stringify(pageSummaries, null, 2);

  switch (feature) {
    case 'priority':
      return `You are an SEO expert. Analyze the following pages from a website and suggest optimal sitemap <priority> values (0.0 to 1.0) for each URL.

Consider these factors:
- Homepage and key landing pages should have higher priority
- Deep/nested pages should have lower priority
- Pages with important content (about, contact, products) should be prioritized
- Return a JSON object with URLs as keys and suggested priority values as values

Site pages:
${siteContext}

Respond with ONLY a valid JSON object mapping URLs to priority values. Example:
{"https://example.com/": 1.0, "https://example.com/about": 0.8}`;

    case 'changefreq':
      return `You are an SEO expert. Analyze the following pages from a website and suggest optimal sitemap <changefreq> values for each URL.

Valid changefreq values: always, hourly, daily, weekly, monthly, yearly, never

Consider these factors:
- Homepages are typically updated weekly or daily
- Blog/news pages are updated frequently
- Static pages (about, contact) change rarely
- Archive pages should be marked as never or yearly

Site pages:
${siteContext}

Respond with ONLY a valid JSON object mapping URLs to changefreq values. Example:
{"https://example.com/": "daily", "https://example.com/about": "monthly"}`;

    case 'content-suggestions':
      return `You are an SEO expert. Analyze the following pages from a website and suggest additional pages or content that this site might be missing to improve its SEO.

Consider:
- Common pages that similar websites typically have
- Missing informational content opportunities
- Industry-standard pages (terms, privacy, FAQ, blog, etc.)
- Content gaps based on the existing URL structure

Current site pages:
${siteContext}

Respond with a JSON array of suggestions, each with "title" and "reason" fields. Example:
[{"title": "FAQ Page", "reason": "A FAQ page can capture long-tail search queries"}]`;

    case 'url-tips':
      return `You are an SEO expert specializing in URL structure optimization. Analyze the following URLs from a website and provide actionable tips to improve their URL structure for better SEO.

Consider:
- URL readability and descriptiveness
- Proper use of hyphens vs underscores
- Unnecessary parameters or session IDs
- URL length and nesting depth
- Keyword usage in URLs
- Canonical URL best practices

Current site URLs:
${siteContext}

Respond with a JSON array of tips, each with "tip" and "affectedUrls" fields. Example:
[{"tip": "Use hyphens instead of underscores in URLs", "affectedUrls": ["https://example.com/my_page"]}]`;

    default:
      throw new Error(`Unknown feature: ${feature}`);
  }
}

// ---------------------------------------------------------------------------
// POST / — AI enhancement
// ---------------------------------------------------------------------------

app.post('/', async (c) => {
  let body: { sessionId?: string; feature?: string };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400);
  }

  // Validate session ID
  if (!body.sessionId || typeof body.sessionId !== 'string' || body.sessionId.trim().length === 0) {
    return c.json({ error: 'sessionId is required' }, 400);
  }

  // Validate feature
  if (!body.feature || typeof body.feature !== 'string') {
    return c.json({ error: 'feature is required' }, 400);
  }

  if (!isValidFeature(body.feature)) {
    return c.json({ error: `feature must be one of: ${VALID_FEATURES.join(', ')}` }, 400);
  }

  const sessionId = body.sessionId.trim();
  const feature = body.feature as Feature;

  // Retrieve AI config from D1
  const config = await c.env.DB
    .prepare('SELECT provider, encrypted_key, base_url, model FROM ai_configs ORDER BY updated_at DESC LIMIT 1')
    .first();

  if (!config) {
    return c.json({ error: 'AI is not configured. Please set up your AI provider in Settings first.' }, 400);
  }

  // Decrypt the API key
  let apiKey: string;
  try {
    apiKey = await decrypt(config.encrypted_key as string, ENCRYPTION_SECRET);
  } catch {
    return c.json({ error: 'Failed to decrypt AI API key. Please reconfigure your AI settings.' }, 500);
  }

  // Fetch pages for context
  const rawPages = await getPagesBySession(c.env.DB, sessionId);

  if (!rawPages || rawPages.length === 0) {
    return c.json({ error: 'No pages found for this session. Run a crawl first.' }, 404);
  }

  const pages = rawPages as Array<Record<string, unknown>>;

  // Build the prompt for the requested feature
  const prompt = buildPrompt(feature, pages);

  // Call the AI provider
  try {
    const suggestions = await callAI(
      {
        provider: config.provider as AIProvider,
        apiKey,
        baseUrl: config.base_url as string | undefined,
        model: config.model as string | undefined,
      },
      prompt
    );

    return c.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI request failed';
    return c.json({ error: message }, 502);
  }
});

export default app;
