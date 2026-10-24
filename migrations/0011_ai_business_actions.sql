CREATE TABLE IF NOT EXISTS ai_business_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  dataset TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  plan_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  committed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_business_actions_owner ON ai_business_actions(user_id, thread_id, created_at);
