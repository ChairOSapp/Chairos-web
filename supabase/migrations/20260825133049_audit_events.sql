-- Audit trail for high-value account/staff/consent actions. Writes only
-- ever happen server-side via the service role key (no INSERT policy is
-- defined for any client-facing role, so RLS blocks every INSERT from
-- the anon/authenticated roles by default -- only service_role, which
-- bypasses RLS entirely, can write). Readable by the shop owner only.
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_shop_created_idx ON audit_events (shop_id, created_at DESC);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_events_select_owner"
  ON audit_events FOR SELECT
  TO authenticated
  USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));
