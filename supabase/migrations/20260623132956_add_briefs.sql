-- Add briefs table for AI daily/weekly business intelligence
CREATE TABLE IF NOT EXISTS briefs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id uuid REFERENCES shops(id),
  recipient_id uuid REFERENCES profiles(id),
  recipient_type text CHECK (recipient_type IN ('owner','barber')),
  brief_type text CHECK (brief_type IN ('daily','weekly')),
  content jsonb,
  summary text,
  delivered_at timestamptz DEFAULT now(),
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefs_recipient_id_idx ON briefs(recipient_id);
CREATE INDEX IF NOT EXISTS briefs_shop_id_idx ON briefs(shop_id);
CREATE INDEX IF NOT EXISTS briefs_delivered_at_idx ON briefs(delivered_at);

ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;

-- Owners can read briefs for their shop
CREATE POLICY "Owners can read their shop briefs"
  ON briefs FOR SELECT
  USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- Barbers can read their own briefs
CREATE POLICY "Barbers can read their own briefs"
  ON briefs FOR SELECT
  USING (recipient_id = auth.uid());

-- Run: npx supabase db push
