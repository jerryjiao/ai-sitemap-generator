/**
 * SEO Issue Analyzer
 *
 * Analyzes crawled page data and internal link data to detect
 * common SEO problems. All checks are pure functions with no
 * external dependencies, making them trivially testable.
 */

export interface SEOIssue {
  type: string;
  severity: "error" | "warning" | "info";
  url: string;
  details: string;
}

export interface PageData {
  url: string;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  h1Text: string | null;
  depth: number;
  hasCanonical: boolean;
  hasNoindex: boolean;
  contentType: string | null;
}

export interface LinkData {
  fromUrl: string;
  toUrl: string;
  linkText: string | null;
}

const SEVERITY_ORDER: Record<string, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * Main entry point — runs every detector and returns a sorted
 * list of issues (errors first, then warnings, then info).
 */
export function analyzeSEO(
  pages: PageData[],
  links: LinkData[]
): SEOIssue[] {
  if (!Array.isArray(pages) || !Array.isArray(links)) {
    return [];
  }

  const issues: SEOIssue[] = [
    ...detectBrokenLinks(pages),
    ...detectMissingTitles(pages),
    ...detectMissingMetaDescriptions(pages),
    ...detectDuplicateTitles(pages),
    ...detectOrphanPages(pages, links),
    ...detectNoindexPages(pages),
    ...detectMissingCanonical(pages),
    ...detectRedirects(pages),
    ...detectMissingH1(pages),
  ];

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return issues;
}

// ---------------------------------------------------------------------------
// Detectors — each returns an array of zero or more issues
// ---------------------------------------------------------------------------

/** 4xx / 5xx status codes indicate broken resources. */
function detectBrokenLinks(pages: PageData[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const page of pages) {
    if (page.statusCode === null) {
      continue;
    }

    if (page.statusCode >= 400 && page.statusCode < 600) {
      issues.push({
        type: "broken_link",
        severity: "error",
        url: page.url,
        details: `Returned HTTP ${page.statusCode}`,
      });
    }
  }

  return issues;
}

/** Every crawlable page should have a title tag. */
function detectMissingTitles(pages: PageData[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const page of pages) {
    if (!page.title || page.title.trim().length === 0) {
      issues.push({
        type: "missing_title",
        severity: "warning",
        url: page.url,
        details: "Page is missing a title tag",
      });
    }
  }

  return issues;
}

/** Every crawlable page should have a meta description. */
function detectMissingMetaDescriptions(pages: PageData[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const page of pages) {
    if (!page.metaDescription || page.metaDescription.trim().length === 0) {
      issues.push({
        type: "missing_meta_description",
        severity: "warning",
        url: page.url,
        details: "Page is missing a meta description",
      });
    }
  }

  return issues;
}

/** Two or more pages sharing the same title dilutes SEO value. */
function detectDuplicateTitles(pages: PageData[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  // Build a map of trimmed title -> array of URLs with that title
  const titleMap = new Map<string, string[]>();

  for (const page of pages) {
    const title = page.title?.trim();
    if (!title) {
      continue;
    }

    const existing = titleMap.get(title);
    if (existing) {
      existing.push(page.url);
    } else {
      titleMap.set(title, [page.url]);
    }
  }

  for (const [title, urls] of titleMap) {
    if (urls.length > 1) {
      for (const url of urls) {
        issues.push({
          type: "duplicate_title",
          severity: "warning",
          url,
          details: `Title "${title}" is shared by ${urls.length} pages`,
        });
      }
    }
  }

  return issues;
}

/**
 * An orphan page has no internal links pointing to it.
 * The start URL (depth 0) is always excluded — it is the entry
 * point the crawler discovered on its own.
 */
function detectOrphanPages(pages: PageData[], links: LinkData[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  // Collect every URL that is the target of at least one internal link
  const linkedUrls = new Set<string>();
  for (const link of links) {
    if (link.toUrl) {
      linkedUrls.add(link.toUrl);
    }
  }

  for (const page of pages) {
    // The start URL is never an orphan
    if (page.depth === 0) {
      continue;
    }

    if (!linkedUrls.has(page.url)) {
      issues.push({
        type: "orphan_page",
        severity: "warning",
        url: page.url,
        details: "No internal links point to this page",
      });
    }
  }

  return issues;
}

/** Pages with noindex will not appear in search results. */
function detectNoindexPages(pages: PageData[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const page of pages) {
    if (page.hasNoindex) {
      issues.push({
        type: "noindex_page",
        severity: "info",
        url: page.url,
        details: "Page contains a noindex directive and will not be indexed",
      });
    }
  }

  return issues;
}

/** Missing canonical can lead to duplicate-content issues. */
function detectMissingCanonical(pages: PageData[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const page of pages) {
    if (!page.hasCanonical) {
      issues.push({
        type: "missing_canonical",
        severity: "info",
        url: page.url,
        details: "Page is missing a canonical tag",
      });
    }
  }

  return issues;
}

/** 3xx redirects are not errors but are worth flagging. */
function detectRedirects(pages: PageData[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const page of pages) {
    if (page.statusCode !== null && page.statusCode >= 300 && page.statusCode < 400) {
      issues.push({
        type: "redirect",
        severity: "info",
        url: page.url,
        details: `HTTP ${page.statusCode} redirect detected`,
      });
    }
  }

  return issues;
}

/** H1 is the most important heading for on-page SEO. */
function detectMissingH1(pages: PageData[]): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const page of pages) {
    if (!page.h1Text || page.h1Text.trim().length === 0) {
      issues.push({
        type: "missing_h1",
        severity: "warning",
        url: page.url,
        details: "Page is missing an H1 heading",
      });
    }
  }

  return issues;
}
