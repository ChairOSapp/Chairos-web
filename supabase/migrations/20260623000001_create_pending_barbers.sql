CREATE TABLE IF NOT EXISTS pending_barbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shop_id, user_id)
);

ALTER TABLE pending_barbers ENABLE ROW LEVEL SECURITY;

-- Owner can see and update requests for their shop
CREATE POLICY "owner_manage_pending_barbers" ON pending_barbers
  FOR ALL
  USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- Barber can insert their own request and read their own status
CREATE POLICY "barber_insert_own_request" ON pending_barbers
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "barber_read_own_request" ON pending_barbers
  FOR SELECT
  USING (user_id = auth.uid());
