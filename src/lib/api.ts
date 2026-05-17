const API_BASE = '/api';

export interface CrawlRequest {
  url: string;
  maxDepth?: number;
}

export interface CrawlResponse {
  sessionId: string;
  status: string;
  message: string;
}

export interface PageData {
  url: string;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  depth: number;
  responseTimeMs: number | null;
  hasCanonical: boolean;
  hasNoindex: boolean;
  contentType: string | null;
}

export interface Issue {
  type: string;
  severity: 'error' | 'warning' | 'info';
  url: string;
  details: string;
}

export interface Stats {
  totalPages: number;
  statusDistribution: Record<string, number>;
  avgDepth: number;
  maxDepth: number;
  avgResponseTime: number;
  issueCounts: { error: number; warning: number; info: number };
}

export interface AISettings {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export async function startCrawl(url: string, maxDepth = 3): Promise<CrawlResponse> {
  const res = await fetch(`${API_BASE}/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, maxDepth }),
  });
  if (!res.ok) throw new Error(`Crawl failed: ${res.statusText}`);
  return res.json();
}

export async function getCrawlStatus(sessionId: string): Promise<CrawlResponse> {
  const res = await fetch(`${API_BASE}/crawl?sessionId=${sessionId}`);
  if (!res.ok) throw new Error(`Status check failed: ${res.statusText}`);
  return res.json();
}

export async function getPages(sessionId: string): Promise<{ pages: PageData[]; total: number }> {
  const res = await fetch(`${API_BASE}/pages/${sessionId}`);
  if (!res.ok) throw new Error(`Pages fetch failed: ${res.statusText}`);
  return res.json();
}

export async function getSitemapXml(sessionId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/sitemap/${sessionId}`);
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.statusText}`);
  return res.text();
}

export async function getIssues(sessionId: string): Promise<{ issues: Issue[] }> {
  const res = await fetch(`${API_BASE}/issues/${sessionId}`);
  if (!res.ok) throw new Error(`Issues fetch failed: ${res.statusText}`);
  return res.json();
}

export async function getStats(sessionId: string): Promise<Stats> {
  const res = await fetch(`${API_BASE}/stats/${sessionId}`);
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.statusText}`);
  return res.json();
}

export function getDownloadUrl(sessionId: string): string {
  return `${API_BASE}/download/${sessionId}`;
}

export async function getAISettings(): Promise<AISettings | null> {
  const res = await fetch(`${API_BASE}/ai-settings`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`AI settings fetch failed: ${res.statusText}`);
  return res.json();
}

export async function saveAISettings(settings: AISettings): Promise<void> {
  const res = await fetch(`${API_BASE}/ai-settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`AI settings save failed: ${res.statusText}`);
}

export async function deleteAISettings(): Promise<void> {
  const res = await fetch(`${API_BASE}/ai-settings`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`AI settings delete failed: ${res.statusText}`);
}

export async function getAIEnhance(sessionId: string, feature: string): Promise<{ suggestions: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/ai-enhance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, feature }),
  });
  if (!res.ok) throw new Error(`AI enhance failed: ${res.statusText}`);
  return res.json();
}
