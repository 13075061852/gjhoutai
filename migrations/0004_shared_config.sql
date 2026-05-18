CREATE TABLE IF NOT EXISTS shared_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO shared_config (id, ciphertext, iv, updated_at)
SELECT 1, ciphertext, iv, updated_at
FROM user_configs
ORDER BY updated_at DESC
LIMIT 1
ON CONFLICT(id) DO NOTHING;
