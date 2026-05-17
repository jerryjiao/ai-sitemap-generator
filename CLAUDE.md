# Project: AI Sitemap Generator

## Overview
An AI-powered Sitemap Generator tool — MVP of a larger "AI SEO Launch Kit" product. Users input a domain URL, the tool crawls the site, generates an SEO-optimized sitemap.xml, visualizes site structure, detects SEO issues, and offers AI-powered enhancement suggestions (optional BYOK).

**Target: Deploy to Cloudflare Pages with full online verification.**

---

## Tech Stack (Non-negotiable)

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | Astro | 5.x (latest) |
| Interactive UI | React Islands (`client:load`) | React 19 |
| UI Components | TailwindCSS 4 + shadcn/ui | latest |
| Backend API | Cloudflare Pages Functions (= Workers) + Hono | 4.x |
| Database | D1 (SQLite) | via wrangler |
| Cache / Rate-limit | KV | via wrangler |
| File Storage | R2 | for sitemap.xml downloads |
| AI (optional/BYOK) | Multi-model adapter | OpenAI-compatible + Anthropic + Google |
| Deployment | Cloudflare Pages + Wrangler | latest |

---

## Architecture

```
Astro SSG Pages (/, /blog, /docs)
  └─→ React Island: /tools/sitemap (the main tool page)
       └─→ API calls to /api/* (Cloudflare Pages Functions = Hono Worker)
            ├─→ D1: store projects, crawl results, user configs
            ├─→ KV: cache results, rate limiting
            └─→ R2: store generated sitemap.xml files for download
                 └─→ External AI APIs (BYOK, user-provided keys)
```

---

## Core Features (MVP — Build ALL of these)

### F1: URL Input & Analysis Launch
- Clean input field for domain/URL
- "Generate Sitemap" button → starts analysis
- Loading state with progress indicator

### F2: Site Crawling (Server-side in Worker)
- Given a starting URL, discover all pages on the site
- Follow internal links (same-origin only, respect robots.txt hints)
- Extract: URL, status code, title tag, meta description, headings (h1-h3)
- Store results in D1
- **Implementation**: Use the Cloudflare Worker's `fetch()` to crawl. NO external crawler library needed — write a simple recursive crawler that:
  1. Fetches the starting URL
  2. Parses HTML to find `<a href>` links (use regex or simple HTML parsing — no heavy deps)
  3. Filters same-origin links only
  4. Follows up to a configurable max depth (default 3, user can set 1-5)
  5. Tracks visited URLs to avoid cycles
  6. Returns structured page data

### F3: Sitemap XML Generation
- Generate valid `sitemap.xml` from crawled data
- Include `<url>`, `<loc>`, `<lastmod>`, `<changefreq>`, `<priority>` fields
- Store generated XML in R2 for download
- Support sitemap index if > 50K URLs (unlikely for MVP but handle gracefully)

### F4: Visual Site Map Tree
- Display crawled pages as a collapsible tree/hierarchy
- Show URL path structure visually
- Color-code by status (200=green, 3xx=yellow, 4xx=red, 5xx=red)
- Show depth level

### F5: SEO Issue Detection
- Detect and report:
  - Broken links (4xx/5xx status codes)
  - Orphan pages (no internal links pointing to them)
  - Pages missing title tags
  - Pages missing meta descriptions
  - Pages with duplicate titles
  - Pages blocked by noindex
  - Redirect chains
- Display as a sorted issue list with severity (error/warning/info)

### F6: Statistics Dashboard
- Total pages found
- Status code distribution (pie or bar)
- Average depth, max depth
- Response time stats
- Issues count by severity

### F7: Export & Download
- Download generated sitemap.xml file
- Copy raw XML to clipboard
- Download crawl report as JSON

### F8: AI Enhancement (BYOK — Optional)
- Settings panel where user can configure their own AI API key
- Support 3 provider types:
  1. **OpenAI Compatible** (covers DeepSeek, 硅基流动, 通义千问, Kimi, OpenRouter, etc.)
  2. **Anthropic** (Claude)
  3. **Google** (Gemini)
- Fields: Provider (select), API Key (password), Base URL (optional, pre-filled default), Model (optional)
- When configured, AI features activate:
  - Smart `<priority>` suggestions per URL
  - Smart `<changefreq>` suggestions
  - Missing content page suggestions ("your competitors have X page")
  - URL structure optimization tips
- **AI is completely optional** — all core features F1-F7 work without any AI key

---

## Page Routes

```
/                      → Landing page (SSG, Astro)
/tools/sitemap         → Main tool page (React Island — this is THE page)
/settings              → AI Key settings (React Island, optional feature)
/robots.txt            → Static
/sitemap.xml           → Static (for our own SEO)
```

For MVP, focus 95% effort on `/tools/sitemap`. Landing page can be minimal but professional.

---

## Database Schema (D1)

```sql
-- Crawl sessions
CREATE TABLE crawl_sessions (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  start_url TEXT NOT NULL,
  max_depth INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending',  -- pending, running, completed, failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Crawled pages
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES crawl_sessions(id),
  url TEXT NOT NULL UNIQUE,
  status_code INTEGER,
  title TEXT,
  meta_description TEXT,
  h1_text TEXT,
  depth INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  has_canonical BOOLEAN DEFAULT 0,
  has_noindex BOOLEAN DEFAULT 0,
  content_type TEXT,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Internal links between pages (for orphan detection)
CREATE TABLE internal_links (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  from_url TEXT NOT NULL,
  to_url TEXT NOT NULL,
  link_text TEXT
);

-- User AI configurations (encrypted key storage)
CREATE TABLE ai_configs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,        -- 'openai-compatible' | 'anthropic' | 'google'
  encrypted_key TEXT NOT NULL,
  base_url TEXT,
  model TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_pages_session ON pages(session_id);
CREATE INDEX idx_pages_status ON pages(status_code);
CREATE INDEX idx_links_session ON internal_links(session_id);
CREATE INDEX idx_links_from ON internal_links(from_url);
```

---

## Project Structure

```
ai-sitemap-generator/
├── CLAUDE.md                  ← This file
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── wrangler.toml              # CF Worker config (D1, KV, R2 bindings)
├── tailwind.config.mjs        # (if needed for shadcn)
│
├── src/
│   ├── pages/
│   │   ├── index.astro        # Landing page
│   │   └── tools/
│   │       └── sitemap.astro  # Tool page shell (loads React Island)
│   │
│   ├── components/
│   │   ├── islands/
│   │   │   └── SitemapTool.tsx    # ★ Main tool React component
│   │   └── ui/                     # shadcn/ui components
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       ├── card.tsx
│   │       ├── badge.tsx
│   │       ├── progress.tsx
│   │       ├── tabs.tsx
│   │       └── ...
│   │
│   ├── layouts/
│   │   └── BaseLayout.astro
│   │
│   ├── styles/
│   │   └── global.css
│   │
│   └── lib/                    # Shared frontend utilities
│       └── api.ts              # API client helper
│
├── functions/                  # Cloudflare Pages Functions (= Worker with Hono)
│   ├── _middleware.ts          # CORS, rate limiting, etc.
│   ├── app.ts                  # Hono app entry point
│   │
│   ├── routes/
│   │   ├── crawl.ts            # POST /api/crawl — start/manage crawl
│   │   ├── sitemap.ts          # GET /api/sitemap/:sessionId — get generated XML
│   │   ├── pages.ts            # GET /api/pages/:sessionId — get crawled pages
│   │   ├── issues.ts           # GET /api/issues/:sessionId — SEO issues
│   │   ├── stats.ts            # GET /api/stats/:sessionID — statistics
│   │   ├── download.ts         # GET /api/download/:sessionId — download sitemap.xml
│   │   ├── ai-settings.ts      # GET/POST/DELETE /api/ai-settings — BYOK config
│   │   └── ai-enhance.ts       # POST /api/ai-enhance — AI suggestions
│   │
│   ├── lib/
│   │   ├── crawler.ts          # ★ The web crawler (fetch + parse links)
│   │   ├── sitemap-generator.ts # ★ Generate sitemap XML string
│   │   ├── seo-analyzer.ts      # ★ SEO issue detection logic
│   │   ├── ai-adapter.ts        # ★ Multi-model AI adapter (BYOK)
│   │   ├── crypto.ts            # Encrypt/decrypt API keys
│   │   ├── r2-store.ts          # R2 upload/download helpers
│   │   ├── kv-cache.ts          # KV cache wrapper
│   │   └── rate-limit.ts        # Rate limiting via KV
│   │
│   └── db/
│       ├── schema.sql           # D1 migration
│       └── queries.ts           # D1 query helpers
│
├── public/
│   ├── favicon.svg
│   ├── og-image.png
│   └── robots.txt
│
└── tests/
    └── basic.test.ts
```

---

## API Design (Hono routes)

### POST /api/crawl
```json
// Request
{ "url": "https://example.com", "maxDepth": 3 }
// Response
{ "sessionId": "uuid", "status": "running", "message": "Crawl started" }
```

### GET /api/pages/:sessionId
```json
// Response
{ "pages": [{ "url", "statusCode", "title", "metaDescription", "h1", "depth" }], "total": N }
```

### GET /api/sitemap/:sessionId
Returns `sitemap.xml` content-type as raw XML

### GET /api/issues/:sessionId
```json
// Response
{ "issues": [{ "type": "broken_link|missing_title|orphan_page|duplicate_title|...", "severity": "error|warning|info", "url", "details" }] }
```

### GET /api/stats/:sessionId
```json
// Response
{ "totalPages": N, "statusDistribution": { "200": N, "404": N, ... }, "avgDepth": N, "maxDepth": N, "issueCounts": { "error": N, "warning": N, "info": N } }
```

### GET /api/download/:sessionId
Downloads the generated sitemap.xml file (from R2)

### POST /api/ai-enhance
```json
// Request
{ "sessionId": "uuid", "feature": "priority|changefreq|content-suggestions|url-tips" }
// Response (only works if user has configured AI key)
{ "suggestions": { ... } }
```

---

## UI/UX Requirements

1. **Modern, clean, professional** — looks like a premium SaaS tool
2. **Dark mode by default** (developers love dark mode), with toggle
3. **Responsive** — works on mobile and desktop
4. **The tool page layout**:
   ```
   ┌──────────────────────────────────────┐
   │  🗺️ AI Sitemap Generator             │
   │                                      │
   │  [https://example.com     ] [▶ Analyze] │
   │  Max Depth: (1-5) ▼                   │
   │                                      │
   │  ┌──────┬──────┬──────┬──────┐       │
   │  │Pages │Issues│Stats │Export│       │  ← Tabs
   │  └──────┴──────┴──────┴──────┘       │
   │                                      │
   │  [Active tab content area]           │
   │  - Pages tab: tree view + table      │
   │  - Issues tab: sorted list           │
   │  - Stats tab: cards + charts        │
   │  - Export tab: download buttons      │
   │                                      │
   │  ⚙️ [AI Settings] (collapsible)      │
   └──────────────────────────────────────┘
   ```
5. **Use shadcn/ui components**: Button, Input, Card, Badge, Tabs, Progress, Skeleton (loading states), Alert, Tooltip, Collapsible (Accordion), Separator
6. **Loading states**: Show skeleton loaders while crawling, real-time progress if possible

---

## Deployment Requirements

1. Use `wrangler.toml` for all Cloudflare bindings (D1, KV, R2)
2. D1 database must be created and migrated via `wrangler d1 execute`
3. R2 bucket for sitemap file storage
4. Deploy via `wrangler pages deploy` or GitHub Actions
5. **Must work online after deployment** — test with a real domain

---

## Critical Constraints

1. **ZERO cost AI APIs** — All core features MUST work without any AI API key. AI is purely optional enhancement.
2. **BYOK only** — Never hardcode any API key. Never pay for AI calls.
3. **Cloudflare free tier only** — Stay within free limits (Workers, D1, KV, R2)
4. **No external crawler dependencies** — Write the crawler using Worker's native `fetch()`. Keep bundle small.
5. **No heavy HTML parsing libs** — Use regex or lightweight parsing for link extraction in the crawler.
6. **Security** — Encrypt stored API keys. Validate URLs (same-origin check). Rate limit crawl requests.

---

## Development Order

1. Initialize project: `npm create astro@latest` + add React integration + Tailwind + shadcn/ui
2. Set up `wrangler.toml` with D1/KV/R2 bindings + create D1 database + run schema
3. Build the Hono API skeleton with all routes
4. Implement `crawler.ts` — the core crawler
5. Implement `sitemap-generator.ts` — XML generation
6. Implement `seo-analyzer.ts` — issue detection
6. Build the React Island `SitemapTool.tsx` — wire up all UI tabs
7. Build landing page `index.astro`
8. Implement `ai-adapter.ts` + AI settings (optional feature)
9. Test locally with `wrangler pages dev`
10. Deploy to Cloudflare Pages
11. **Online verification** — test with a real public website

---

## Done Criteria

The project is COMPLETE when:

1. `npm run build` passes with zero errors
2. `wrangler pages dev` runs locally without errors
3. Deployed to Cloudflare Pages at a live URL
4. Can input a real domain (e.g., `example.com` or a small real site) and:
   - Successfully crawls and discovers pages
   - Generates a valid, downloadable sitemap.xml
   - Shows page tree visualization
   - Detects and lists SEO issues
   - Shows statistics dashboard
   - All export/download functions work
5. Landing page loads and looks professional
6. No hardcoded secrets or API keys in source code
