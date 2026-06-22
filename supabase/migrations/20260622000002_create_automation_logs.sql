CREATE TABLE IF NOT EXISTS automation_logs (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  type       text        NOT NULL,
  payload    jsonb,
  result     text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Only the service role (Trigger.dev tasks) accesses this table
CREATE POLICY "service role only" ON automation_logs USING (false);
