CREATE INDEX IF NOT EXISTS automation_logs_type_created
  ON automation_logs (type, created_at DESC);
