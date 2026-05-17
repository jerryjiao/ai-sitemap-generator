/**
 * Sitemap XML Generator
 *
 * Generates a valid sitemap.xml string from crawled page data.
 * No external dependencies — pure string building with proper XML escaping.
 */

export interface SitemapPage {
  url: string;
  statusCode: number | null;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  depth?: number;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
const URLSET_OPEN =
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const URLSET_CLOSE = "</urlset>";

const MAX_SITEMAP_URLS = 50000;

/**
 * Escape special XML characters in a string.
 * Covers the five required entities: &, <, >, ", '
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Auto-calculate priority based on page depth.
 *   depth 0  => 1.0  (homepage / root)
 *   depth 1  => 0.8
 *   depth 2  => 0.6
 *   depth 3+ => 0.4
 */
function defaultPriority(depth: number): number {
  if (depth <= 0) return 1.0;
  if (depth === 1) return 0.8;
  if (depth === 2) return 0.6;
  return 0.4;
}

/**
 * Auto-calculate changefreq based on page depth.
 *   depth 0  => "weekly"   (homepage)
 *   depth 1  => "weekly"
 *   depth 2+ => "monthly"
 */
function defaultChangefreq(depth: number): string {
  if (depth <= 1) return "weekly";
  return "monthly";
}

/**
 * Validate that a lastmod value looks like a valid date string.
 * Accepts ISO 8601 (YYYY-MM-DD) and full datetime formats.
 */
function isValidLastmod(value: string): boolean {
  // Matches YYYY-MM-DD with optional time component
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

/**
 * Validate that a changefreq value is one of the allowed sitemap values.
 */
const VALID_CHANGEFREQ = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

function isValidChangefreq(value: string): boolean {
  return VALID_CHANGEFREQ.has(value);
}

/**
 * Validate that a priority value is within the valid range [0.0, 1.0].
 */
function isValidPriority(value: number): boolean {
  return Number.isFinite(value) && value >= 0.0 && value <= 1.0;
}

/**
 * Build a single <url> element.
 */
function buildUrlElement(page: SitemapPage): string {
  const depth = page.depth ?? 0;
  const loc = escapeXml(page.url);

  // Priority: explicit value, or auto-calculated from depth
  let priority: number;
  if (page.priority !== undefined && isValidPriority(page.priority)) {
    priority = page.priority;
  } else {
    priority = defaultPriority(depth);
  }

  // Changefreq: explicit value, or auto-calculated from depth
  let changefreq: string;
  if (page.changefreq && isValidChangefreq(page.changefreq)) {
    changefreq = page.changefreq;
  } else {
    changefreq = defaultChangefreq(depth);
  }

  let xml = `  <url>\n    <loc>${loc}</loc>\n`;

  if (page.lastmod && isValidLastmod(page.lastmod)) {
    xml += `    <lastmod>${escapeXml(page.lastmod)}</lastmod>\n`;
  }

  xml += `    <changefreq>${changefreq}</changefreq>\n`;
  xml += `    <priority>${priority.toFixed(1)}</priority>\n`;
  xml += `  </url>`;

  return xml;
}

/**
 * Generate a valid sitemap.xml string from crawled page data.
 *
 * - Only includes pages with HTTP status code 200.
 * - Caps at 50,000 URLs per the sitemap protocol.
 * - Auto-calculates priority and changefreq from depth when not provided.
 * - Properly escapes all special XML characters.
 */
export function generateSitemap(pages: SitemapPage[]): string {
  if (!Array.isArray(pages)) {
    throw new Error("generateSitemap: pages must be an array");
  }

  // Filter to only successful pages (status 200)
  const validPages = pages.filter(
    (page) => page.statusCode === 200 && typeof page.url === "string" && page.url.length > 0
  );

  // Cap at maximum allowed URLs
  const capped = validPages.slice(0, MAX_SITEMAP_URLS);

  if (capped.length === 0) {
    // Still generate a valid empty sitemap — the protocol allows it
    return `${XML_HEADER}\n${URLSET_OPEN}\n${URLSET_CLOSE}`;
  }

  const urlElements = capped.map(buildUrlElement).join("\n");

  return `${XML_HEADER}\n${URLSET_OPEN}\n${urlElements}\n${URLSET_CLOSE}`;
}
