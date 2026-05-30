CREATE TABLE IF NOT EXISTS data_recognition_records (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  file_name TEXT NOT NULL,
  image_key TEXT NOT NULL,
  image_content_type TEXT NOT NULL,
  model TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL,
  raw_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_data_recognition_records_created_by_created_at
  ON data_recognition_records(created_by, created_at DESC);
