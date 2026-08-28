CREATE TABLE review_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id uuid REFERENCES reviews(id) ON DELETE CASCADE UNIQUE NOT NULL,
  shop_id uuid REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  draft_text text NOT NULL,
  edited_text text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'posted', 'dismissed')),
  ai_generated boolean NOT NULL DEFAULT true,
  generated_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  posted_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX ON review_responses(shop_id);

ALTER TABLE review_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manage_review_responses" ON review_responses
  FOR ALL USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  ) WITH CHECK (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );
