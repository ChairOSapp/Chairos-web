CREATE TABLE recommendations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id uuid REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('underbooked_service', 'staffing_imbalance', 'pricing_signal')),
  title text NOT NULL,
  detail text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed')),
  created_at timestamptz DEFAULT now(),
  dismissed_at timestamptz
);

CREATE INDEX ON recommendations(shop_id, status);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manage_recommendations" ON recommendations
  FOR ALL USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  ) WITH CHECK (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );
