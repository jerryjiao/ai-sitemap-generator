# AI Sitemap Generator

**Free AI-powered sitemap generator for modern websites**

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Astro 5](https://img.shields.io/badge/Astro-5.x-FF5D01?logo=astro&logoColor=white)](https://astro.build/)
[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Open Source](https://img.shields.io/badge/Open-Source-brightgreen.svg)](https://opensource.org/)

A free sitemap generator that crawls your website, detects SEO issues, and produces a production-ready `sitemap.xml` -- no sign-up, no credit card, no vendor lock-in. Optional AI-powered insights via your own API key.

Try it live: **[ai-sitemap-generator.pages.dev](https://ai-sitemap-generator.pages.dev)**

---

## Features

| | Feature | Details |
|:---:|---------|---------|
| **FREE** | **Free and no sign-up required** | Use immediately. No account, no email, no tracking. |
| **SPIDER** | **Smart crawling** | Configurable depth 1-5. Follows internal links, respects same-origin policy, avoids cycles. |
| **SEARCH** | **SEO issue detection** | Broken links, missing titles, missing meta descriptions, duplicate content, orphan pages, redirect chains, noindex flags. |
| **TREE** | **Visual site tree** | Collapsible hierarchy view with color-coded HTTP status (green/yellow/red). |
| **CHART** | **Statistics dashboard** | Page count, status distribution, depth metrics, response times, issue severity breakdown. |
| **DOWNLOAD** | **Export** | Download `sitemap.xml`, copy raw XML to clipboard, or export the full crawl report as JSON. |
| **SPARKLES** | **AI-powered insights** | Smart priority and changefreq suggestions, content gap analysis. Bring your own key -- optional. |

---

## How It Works

**1. Enter your URL**

Paste any public domain or URL into the input field. Set the crawl depth (1-5 levels) to control how far the crawler traverses your site.

**2. Analyze and crawl**

The SEO sitemap tool crawls every discoverable page on your site, extracting titles, meta descriptions, headings, status codes, and internal link structure. Issues are flagged in real time.

**3. Download your sitemap**

Review the visual site tree, check detected issues, then download a standards-compliant `sitemap.xml` ready for Google Search Console, Bing Webmaster Tools, or any search engine.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Astro 5 with React Islands |
| Styling | TailwindCSS 4 + shadcn/ui |
| API | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Storage | Cloudflare R2 |
| Deployment | Cloudflare Pages |

Runs entirely on the Cloudflare free tier. No external servers, no databases to manage.

---

## AI Enhancement (BYOK)

All core features work perfectly without any AI integration. If you want smarter suggestions, bring your own API key.

**Supported providers:**

- **OpenAI-compatible** -- Covers DeepSeek, OpenRouter, SiliconFlow, Qwen, Kimi, and any OpenAI-format endpoint.
- **Anthropic** -- Claude models.
- **Google** -- Gemini models.

Configure your key in the in-app settings panel. Keys are encrypted at rest and never sent to our servers in plaintext. The AI adapter generates priority recommendations, changefreq suggestions, content gap analysis, and URL structure optimization tips -- all processed through your own account.

---

## Getting Started

### Use the live version

Head to **[ai-sitemap-generator.pages.dev](https://ai-sitemap-generator.pages.dev)** and start generating sitemaps immediately. Zero setup.

### Run locally

```bash
# Clone the repository
git clone https://github.com/jerryjiao/ai-sitemap-generator.git
cd ai-sitemap-generator

# Install dependencies
npm install

# Start the development server (with Cloudflare bindings)
npx wrangler pages dev -- npm run dev
```

The XML sitemap generator online will be available at `http://localhost:8788`.

### Deploy your own instance

```bash
# Build for production
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist
```

You will need to create D1, KV, and R2 bindings in your `wrangler.toml`. See the project documentation for the full setup guide.

---

## Why Another Sitemap Generator?

Most free sitemap generator tools are ad-heavy, require sign-ups, or produce incomplete output. This project is open source, runs at the edge for speed, and goes beyond basic XML generation by surfacing actionable SEO issues -- broken links, missing metadata, orphan pages, and duplicate content -- in a single pass.

The optional AI layer adds intelligent priority scoring and content suggestions without forcing you into a paid plan. Your keys, your models, your control.

---

## License

This project is released under the [MIT License](./LICENSE).
