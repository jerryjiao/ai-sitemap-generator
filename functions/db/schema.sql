CREATE TABLE IF NOT EXISTS crawl_sessions (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  start_url TEXT NOT NULL,
  max_depth INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES crawl_sessions(id),
  url TEXT NOT NULL,
  status_code INTEGER,
  title TEXT,
  meta_description TEXT,
  h1_text TEXT,
  depth INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  has_canonical INTEGER DEFAULT 0,
  has_noindex INTEGER DEFAULT 0,
  content_type TEXT,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS internal_links (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  from_url TEXT NOT NULL,
  to_url TEXT NOT NULL,
  link_text TEXT
);

CREATE TABLE IF NOT EXISTS ai_configs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  base_url TEXT,
  model TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pages_session ON pages(session_id);
CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status_code);
CREATE INDEX IF NOT EXISTS idx_links_session ON internal_links(session_id);
CREATE INDEX IF NOT EXISTS idx_links_from ON internal_links(from_url);
