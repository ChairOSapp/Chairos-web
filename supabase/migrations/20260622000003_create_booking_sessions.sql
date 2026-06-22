CREATE TABLE IF NOT EXISTS booking_sessions (
  id           uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id   text  UNIQUE NOT NULL,
  client_phone text,
  client_name  text,
  shop_name    text,
  barber_id    text,
  barber_name  text,
  status       text  NOT NULL DEFAULT 'abandoned'
                     CHECK (status IN ('abandoned', 'completed')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Index for the status check in the task
CREATE INDEX IF NOT EXISTS booking_sessions_session_id ON booking_sessions (session_id);

ALTER TABLE booking_sessions ENABLE ROW LEVEL SECURITY;

-- Only the service role accesses this table
CREATE POLICY "service role only" ON booking_sessions USING (false);
