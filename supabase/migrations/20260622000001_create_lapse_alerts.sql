CREATE TABLE IF NOT EXISTS lapse_alerts (
  id            uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid         REFERENCES shops(id) ON DELETE CASCADE,
  barber_id     uuid         REFERENCES profiles(id) ON DELETE SET NULL,
  client_id     uuid         REFERENCES clients(id) ON DELETE SET NULL,
  client_phone  text,
  client_name   text,
  last_visit_at timestamptz,
  lapse_type    text         NOT NULL CHECK (lapse_type IN ('standard', 'loyalty')),
  alerted_at    timestamptz  DEFAULT now(),
  resolved_at   timestamptz,
  created_at    timestamptz  DEFAULT now()
);

-- Efficient duplicate check: find unresolved alerts per client per shop
CREATE INDEX IF NOT EXISTS lapse_alerts_shop_client_unresolved
  ON lapse_alerts (shop_id, client_phone)
  WHERE resolved_at IS NULL;

ALTER TABLE lapse_alerts ENABLE ROW LEVEL SECURITY;

-- Only the service role (Trigger.dev tasks) accesses this table
CREATE POLICY "service role only" ON lapse_alerts USING (false);
