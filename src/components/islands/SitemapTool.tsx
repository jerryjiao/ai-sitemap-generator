import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  GitBranch,
  TrendingUp,
  Globe,
  Loader2,
  Play,
  AlertTriangle,
  X,
  Settings2,
  Download,
  Copy,
  FileJson,
  ChevronDown,
  CheckCircle2,
  Timer,
  FileCode2,
  ArrowUpDown,
  Shield,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Progress } from '../ui/progress';
import { Skeleton } from '../ui/skeleton';
import { Select } from '../ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible';
import {
  startCrawl,
  getCrawlStatus,
  getPages,
  getIssues,
  getStats,
  getSitemapXml,
  getDownloadUrl,
  getAISettings,
  saveAISettings,
  deleteAISettings,
  type PageData,
  type Issue,
  type Stats,
  type AISettings,
} from '../../lib/api';

type ActiveTab = 'pages' | 'issues' | 'stats' | 'export';

export default function SitemapTool() {
  // Form state
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(3);
  const [activeTab, setActiveTab] = useState<ActiveTab>('pages');

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [crawlStatus, setCrawlStatus] = useState<string>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Data state
  const [pages, setPages] = useState<PageData[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sitemapXml, setSitemapXml] = useState<string | null>(null);

  // AI settings state
  const [aiSettings, setAiSettings] = useState<AISettings>({
    provider: 'openai-compatible',
    apiKey: '',
    baseUrl: '',
    model: '',
  });
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);

  // UI state
  const [copySuccess, setCopySuccess] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load AI settings on mount
  useEffect(() => {
    getAISettings()
      .then((settings) => {
        if (settings) {
          setAiSettings(settings);
        }
      })
      .catch(() => {
        // No saved settings, ignore
      });
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pollCrawlStatus = useCallback((sid: string) => {
    let pollCount = 0;
    pollRef.current = setInterval(async () => {
      pollCount++;
      try {
        const status = await getCrawlStatus(sid);
        setCrawlStatus(status.status);

        if (status.status === 'running') {
          setProgress(Math.min(10 + pollCount * 8, 90));
        }

        if (status.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setProgress(100);
          await fetchAllData(sid);
          setLoading(false);
        } else if (status.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setError('Crawl failed. The site may be unreachable or blocking requests.');
          setLoading(false);
        }

        if (pollCount > 60) {
          if (pollRef.current) clearInterval(pollRef.current);
          setError('Crawl timed out. The site may be too large or slow.');
          setLoading(false);
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
        setError('Lost connection to the crawl service.');
        setLoading(false);
      }
    }, 2000);
  }, []);

  const fetchAllData = async (sid: string) => {
    try {
      const [pagesRes, issuesRes, statsRes] = await Promise.all([
        getPages(sid),
        getIssues(sid),
        getStats(sid),
      ]);
      setPages(pagesRes.pages);
      setIssues(issuesRes.issues);
      setStats(statsRes);
    } catch (err) {
      setError('Failed to load crawl results. Please try again.');
      console.error('Data fetch error:', err);
    }
  };

  const handleAnalyze = async () => {
    let cleanUrl = url.trim();
    if (!cleanUrl) {
      setError('Please enter a URL to analyze.');
      return;
    }

    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    try {
      new URL(cleanUrl);
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com).');
      return;
    }

    setError(null);
    setLoading(true);
    setProgress(0);
    setCrawlStatus('pending');
    setPages([]);
    setIssues([]);
    setStats(null);
    setSitemapXml(null);
    setUrl(cleanUrl);

    try {
      const response = await startCrawl(cleanUrl, maxDepth);
      setSessionId(response.sessionId);
      setCrawlStatus(response.status);

      if (response.status === 'completed') {
        setProgress(100);
        await fetchAllData(response.sessionId);
        setLoading(false);
      } else if (response.status === 'running' || response.status === 'pending') {
        pollCrawlStatus(response.sessionId);
      } else if (response.status === 'failed') {
        setError(response.message || 'Crawl failed immediately.');
        setLoading(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to start crawl. Please try again.'
      );
      setLoading(false);
    }
  };

  const handleCopyXml = async () => {
    if (!sessionId) return;
    try {
      const xml = await getSitemapXml(sessionId);
      setSitemapXml(xml);
      await navigator.clipboard.writeText(xml);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError('Failed to copy XML to clipboard.');
    }
  };

  const handleDownloadJson = () => {
    if (!sessionId) return;
    const a = document.createElement('a');
    a.href = `/api/export/json/${sessionId}`;
    a.download = `sitemap-export-${sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveAISettings = async () => {
    setAiSaving(true);
    setAiSaved(false);
    try {
      await saveAISettings(aiSettings);
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 2000);
    } catch (err) {
      setError('Failed to save AI settings.');
      console.error('AI save error:', err);
    } finally {
      setAiSaving(false);
    }
  };

  const handleDeleteAISettings = async () => {
    try {
      await deleteAISettings();
      setAiSettings({ provider: 'openai-compatible', apiKey: '', baseUrl: '', model: '' });
      setAiSaved(false);
    } catch {
      setError('Failed to delete AI settings.');
    }
  };

  const getStatusColor = (code: number) => {
    if (code >= 200 && code < 300) return 'text-success';
    if (code >= 300 && code < 400) return 'text-warning';
    return 'text-destructive';
  };

  const getStatusBg = (code: number) => {
    if (code >= 200 && code < 300) return 'bg-success/20 text-success';
    if (code >= 300 && code < 400) return 'bg-warning/20 text-warning';
    return 'bg-destructive/20 text-destructive';
  };

  const getSeverityBadge = (severity: Issue['severity']) => {
    switch (severity) {
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'warning':
        return <Badge variant="warning">Warning</Badge>;
      case 'info':
        return <Badge variant="secondary">Info</Badge>;
    }
  };

  const severityCounts = {
    error: issues.filter((i) => i.severity === 'error').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          AI Sitemap Generator
        </h1>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Enter a domain to crawl, analyze SEO issues, and generate a production-ready sitemap.xml
        </p>
      </div>

      {/* URL Input Card */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loading) handleAnalyze();
                }}
                disabled={loading}
                className="font-mono text-base h-12"
                aria-label="Website URL to analyze"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="flex items-center gap-2">
                <label htmlFor="max-depth" className="text-sm text-muted-foreground whitespace-nowrap">
                  Depth:
                </label>
                <div className="relative flex-1 sm:flex-none">
                  <Select
                    id="max-depth"
                    value={String(maxDepth)}
                    onChange={(e) => setMaxDepth(Number(e.target.value))}
                    disabled={loading}
                    options={[
                      { value: '1', label: '1 level' },
                      { value: '2', label: '2 levels' },
                      { value: '3', label: '3 levels' },
                      { value: '4', label: '4 levels' },
                      { value: '5', label: '5 levels' },
                    ]}
                    className="w-full sm:w-32 h-12 pr-8"
                  />
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <Button
                onClick={handleAnalyze}
                disabled={loading}
                size="lg"
                className="h-12 px-6 bg-primary hover:bg-primary/90 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-200 w-full sm:w-auto"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    {crawlStatus === 'pending' ? 'Starting...' : 'Crawling...'}
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1.5" />
                    Analyze
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          {loading && (
            <div className="mt-4 space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground text-center">
                {crawlStatus === 'pending'
                  ? 'Initializing crawler...'
                  : `Crawling in progress... ${progress}% complete`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-destructive font-medium">Error</p>
            <p className="text-sm text-destructive/80">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-destructive/60 hover:text-destructive transition-colors"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && <LoadingSkeleton />}

      {/* Results */}
      {!loading && pages.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <Tabs defaultValue="pages" value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="pages">
                  <FileText className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
                  Pages <span className="ml-1.5 text-xs opacity-70">({pages.length})</span>
                </TabsTrigger>
                <TabsTrigger value="issues">
                  <Shield className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
                  Issues <span className="ml-1.5 text-xs opacity-70">({issues.length})</span>
                </TabsTrigger>
                <TabsTrigger value="stats">
                  <TrendingUp className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
                  Stats
                </TabsTrigger>
                <TabsTrigger value="export">
                  <Download className="w-3.5 h-3.5 mr-1 hidden sm:inline" />
                  Export
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pages">
                <PagesTab pages={pages} getStatusBg={getStatusBg} />
              </TabsContent>

              <TabsContent value="issues">
                <IssuesTab issues={issues} severityCounts={severityCounts} getSeverityBadge={getSeverityBadge} />
              </TabsContent>

              <TabsContent value="stats">
                {stats && <StatsTab stats={stats} />}
              </TabsContent>

              <TabsContent value="export">
                <ExportTab
                  sessionId={sessionId}
                  copySuccess={copySuccess}
                  onCopyXml={handleCopyXml}
                  onDownloadJson={handleDownloadJson}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && pages.length === 0 && !error && sessionId === null && (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center mx-auto">
            <Globe className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <p className="text-muted-foreground text-lg">Enter a URL above to get started</p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              We will crawl the site, analyze SEO, and generate your sitemap
            </p>
          </div>
        </div>
      )}

      {/* GitHub star prompt after results */}
      {!loading && pages.length > 0 && (
        <div className="text-center py-4">
          <a
            href="https://github.com/jerryjiao/ai-sitemap-generator"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            Star us on GitHub
          </a>
        </div>
      )}

      {/* AI Settings */}
      <Collapsible className="mt-8">
        <CollapsibleTrigger>
          <span className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <Settings2 className="w-4 h-4" />
            AI Enhancement Settings (Optional - API Key)
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <AISettingsPanel
            settings={aiSettings}
            onChange={setAiSettings}
            onSave={handleSaveAISettings}
            onDelete={handleDeleteAISettings}
            saving={aiSaving}
            saved={aiSaved}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// =========================================================================
// Sub-components
// =========================================================================

function LoadingSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex gap-4">
          {['Pages', 'Issues', 'Stats', 'Export'].map((tab) => (
            <Skeleton key={tab} className="h-10 w-24 rounded-md" />
          ))}
        </div>
        <div className="space-y-3 mt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PagesTab({ pages, getStatusBg }: { pages: PageData[]; getStatusBg: (code: number) => string }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'url' | 'statusCode' | 'depth'>('depth');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = pages.filter(
    (p) =>
      p.url.toLowerCase().includes(search.toLowerCase()) ||
      (p.title && p.title.toLowerCase().includes(search.toLowerCase()))
  );

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'url') cmp = a.url.localeCompare(b.url);
    else if (sortBy === 'statusCode') cmp = a.statusCode - b.statusCode;
    else cmp = a.depth - b.depth;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const SortIndicator = ({ col }: { col: typeof sortBy }) => (
    <span className="ml-1 text-xs opacity-50">
      {sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {filtered.length} page{filtered.length !== 1 ? 's' : ''} found
        </p>
        <Input
          placeholder="Filter pages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm w-full sm:w-auto"
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left p-3 font-medium text-muted-foreground">
                <button className="hover:text-foreground transition-colors" onClick={() => toggleSort('url')}>
                  URL <SortIndicator col="url" />
                </button>
              </th>
              <th className="text-left p-3 font-medium text-muted-foreground w-20">
                <button className="hover:text-foreground transition-colors" onClick={() => toggleSort('statusCode')}>
                  Status <SortIndicator col="statusCode" />
                </button>
              </th>
              <th className="text-left p-3 font-medium text-muted-foreground">Title</th>
              <th className="text-left p-3 font-medium text-muted-foreground w-16">
                <button className="hover:text-foreground transition-colors" onClick={() => toggleSort('depth')}>
                  Depth <SortIndicator col="depth" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((page, idx) => (
              <tr
                key={page.url}
                className={[
                  'border-b border-border/50 hover:bg-secondary/30 transition-colors',
                  idx % 2 === 0 ? '' : 'bg-secondary/10',
                ].join(' ')}
              >
                <td className="p-3">
                  <span className="font-mono text-xs break-all">{page.url}</span>
                </td>
                <td className="p-3">
                  <span
                    className={['inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-bold', getStatusBg(page.statusCode)].join(' ')}
                  >
                    {page.statusCode}
                  </span>
                </td>
                <td className="p-3 max-w-xs truncate">
                  {page.title || <span className="text-muted-foreground italic">No title</span>}
                </td>
                <td className="p-3 text-center text-muted-foreground">{page.depth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && pages.length > 0 && (
        <p className="text-center text-muted-foreground text-sm py-8">
          No pages match your filter.
        </p>
      )}
    </div>
  );
}

function IssuesTab({
  issues,
  severityCounts,
  getSeverityBadge,
}: {
  issues: Issue[];
  severityCounts: { error: number; warning: number; info: number };
  getSeverityBadge: (severity: Issue['severity']) => React.ReactNode;
}) {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const filtered = filterSeverity === 'all' ? issues : issues.filter((i) => i.severity === filterSeverity);

  const severityOrder = { error: 0, warning: 1, info: 2 };
  const sorted = [...filtered].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">Issues found:</span>
        <button
          onClick={() => setFilterSeverity('all')}
          className={['text-xs px-2 py-1 rounded-full transition-colors', filterSeverity === 'all' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'].join(' ')}
        >
          All ({issues.length})
        </button>
        {severityCounts.error > 0 && (
          <button
            onClick={() => setFilterSeverity('error')}
            className={['text-xs px-2 py-1 rounded-full transition-colors', filterSeverity === 'error' ? 'bg-destructive text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'].join(' ')}
          >
            Errors ({severityCounts.error})
          </button>
        )}
        {severityCounts.warning > 0 && (
          <button
            onClick={() => setFilterSeverity('warning')}
            className={['text-xs px-2 py-1 rounded-full transition-colors', filterSeverity === 'warning' ? 'bg-warning text-black' : 'bg-secondary text-muted-foreground hover:text-foreground'].join(' ')}
          >
            Warnings ({severityCounts.warning})
          </button>
        )}
        {severityCounts.info > 0 && (
          <button
            onClick={() => setFilterSeverity('info')}
            className={['text-xs px-2 py-1 rounded-full transition-colors', filterSeverity === 'info' ? 'bg-secondary text-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'].join(' ')}
          >
            Info ({severityCounts.info})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {sorted.map((issue, idx) => (
          <div
            key={`${issue.type}-${issue.url}-${idx}`}
            className="rounded-lg border border-border p-4 hover:bg-secondary/20 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getSeverityBadge(issue.severity)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">
                  {formatIssueType(issue.type)}
                </p>
                <p className="text-xs font-mono text-muted-foreground mt-1 truncate">
                  {issue.url}
                </p>
                <p className="text-sm text-muted-foreground mt-2">{issue.details}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6 text-success" />
          </div>
          <p className="text-muted-foreground">
            {filterSeverity === 'all'
              ? 'No issues detected. Great SEO health!'
              : `No ${filterSeverity}-level issues found.`}
          </p>
        </div>
      )}
    </div>
  );
}

function StatsTab({ stats }: { stats: Stats }) {
  const maxStatusCount = Math.max(...Object.values(stats.statusDistribution), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Pages" value={String(stats.totalPages)} icon={<FileText className="w-5 h-5 text-indigo-400" />} />
        <StatCard label="Avg Depth" value={stats.avgDepth.toFixed(1)} icon={<ArrowUpDown className="w-5 h-5 text-indigo-400" />} />
        <StatCard label="Max Depth" value={String(stats.maxDepth)} icon={<GitBranch className="w-5 h-5 text-indigo-400" />} />
        <StatCard
          label="Avg Response"
          value={stats.avgResponseTime > 0 ? `${Math.round(stats.avgResponseTime)}ms` : 'N/A'}
          icon={<Timer className="w-5 h-5 text-indigo-400" />}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Status Code Distribution</h3>
        <div className="space-y-2">
          {Object.entries(stats.statusDistribution)
            .sort(([, a], [, b]) => b - a)
            .map(([code, count]) => {
              const widthPct = (count / maxStatusCount) * 100;
              const barColor =
                code.startsWith('2')
                  ? 'bg-success'
                  : code.startsWith('3')
                  ? 'bg-warning'
                  : 'bg-destructive';
              return (
                <div key={code} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-8 text-right">{code}</span>
                  <div className="flex-1 h-6 bg-secondary rounded overflow-hidden">
                    <div
                      className={[barColor, 'h-full rounded transition-all duration-500'].join(' ')}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8">{count}</span>
                </div>
              );
            })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Issue Summary</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.issueCounts.error}</p>
            <p className="text-xs text-muted-foreground mt-1">Errors</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <p className="text-2xl font-bold text-warning">{stats.issueCounts.warning}</p>
            <p className="text-xs text-muted-foreground mt-1">Warnings</p>
          </div>
          <div className="rounded-lg border border-border p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{stats.issueCounts.info}</p>
            <p className="text-xs text-muted-foreground mt-1">Info</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function ExportTab({
  sessionId,
  copySuccess,
  onCopyXml,
  onDownloadJson,
}: {
  sessionId: string | null;
  copySuccess: boolean;
  onCopyXml: () => void;
  onDownloadJson: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-foreground mb-4">Download your generated files</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border p-6 flex flex-col items-center gap-3 hover:bg-secondary/20 hover:border-indigo-500/20 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
              <FileCode2 className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-foreground">sitemap.xml</p>
            <p className="text-xs text-muted-foreground text-center">Download the generated sitemap</p>
            {sessionId ? (
              <a
                href={getDownloadUrl(sessionId)}
                download
                className="mt-auto"
              >
                <Button size="sm">Download XML</Button>
              </a>
            ) : (
              <Button size="sm" disabled>Download XML</Button>
            )}
          </div>

          <div className="rounded-xl border border-border p-6 flex flex-col items-center gap-3 hover:bg-secondary/20 hover:border-indigo-500/20 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
              <Copy className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-foreground">Copy to Clipboard</p>
            <p className="text-xs text-muted-foreground text-center">Copy raw XML content</p>
            <Button size="sm" variant="outline" onClick={onCopyXml} className="mt-auto">
              {copySuccess ? 'Copied!' : 'Copy XML'}
            </Button>
          </div>

          <div className="rounded-xl border border-border p-6 flex flex-col items-center gap-3 hover:bg-secondary/20 hover:border-indigo-500/20 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
              <FileJson className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-foreground">Crawl Report</p>
            <p className="text-xs text-muted-foreground text-center">Full report as JSON</p>
            <Button size="sm" variant="outline" onClick={onDownloadJson} className="mt-auto">
              Download JSON
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AISettingsPanel({
  settings,
  onChange,
  onSave,
  onDelete,
  saving,
  saved,
}: {
  settings: AISettings;
  onChange: (settings: AISettings) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const providerDefaults: Record<string, string> = {
    'openai-compatible': 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
    google: 'https://generativelanguage.googleapis.com/v1',
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-4">
        Configure your own AI API key to enable smart priority suggestions, changefreq recommendations,
        and content gap analysis. Your key is encrypted and stored locally. All core features work without AI.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Provider</label>
          <Select
            value={settings.provider}
            onChange={(e) => {
              const provider = e.target.value;
              onChange({
                ...settings,
                provider,
                baseUrl: providerDefaults[provider] || '',
              });
            }}
            options={[
              { value: 'openai-compatible', label: 'OpenAI Compatible' },
              { value: 'anthropic', label: 'Anthropic (Claude)' },
              { value: 'google', label: 'Google (Gemini)' },
            ]}
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">API Key</label>
          <Input
            type="password"
            placeholder="sk-..."
            value={settings.apiKey}
            onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Base URL (optional)</label>
          <Input
            type="text"
            placeholder={providerDefaults[settings.provider] || 'https://...'}
            value={settings.baseUrl}
            onChange={(e) => onChange({ ...settings, baseUrl: e.target.value })}
            className="font-mono"
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Model (optional)</label>
          <Input
            type="text"
            placeholder="e.g., gpt-4o, claude-3-sonnet, gemini-pro"
            value={settings.model}
            onChange={(e) => onChange({ ...settings, model: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-3 justify-end pt-2">
        {settings.apiKey && (
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete Key
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={saving || !settings.apiKey}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}

function formatIssueType(type: string): string {
  const labels: Record<string, string> = {
    broken_link: 'Broken Link',
    missing_title: 'Missing Title Tag',
    missing_meta_description: 'Missing Meta Description',
    duplicate_title: 'Duplicate Title',
    orphan_page: 'Orphan Page',
    noindex_page: 'Noindex Page',
    redirect_chain: 'Redirect Chain',
    missing_h1: 'Missing H1 Tag',
    long_url: 'Long URL',
    shallow_content: 'Shallow Content',
  };
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
