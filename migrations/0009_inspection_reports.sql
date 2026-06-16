CREATE TABLE IF NOT EXISTS inspection_reports (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inspection_reports_created_at
  ON inspection_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inspection_reports_created_by_created_at
  ON inspection_reports(created_by, created_at DESC);
