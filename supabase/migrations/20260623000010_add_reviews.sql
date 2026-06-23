CREATE TABLE reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
  barber_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  source text CHECK (source IN ('google','booksy','manual','chairos')),
  reviewer_name text NOT NULL,
  rating integer CHECK (rating BETWEEN 1 AND 5),
  body text,
  review_date date,
  imported_at timestamptz DEFAULT now(),
  visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON reviews(shop_id);
CREATE INDEX ON reviews(barber_id);

-- Unique index for Google deduplication (upsert support)
CREATE UNIQUE INDEX reviews_google_dedup
  ON reviews(shop_id, reviewer_name, review_date)
  WHERE source = 'google';

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Public can read visible reviews
CREATE POLICY "public_read_visible_reviews" ON reviews
  FOR SELECT USING (visible = true);

-- Owner can do everything on their shop's reviews
CREATE POLICY "owner_manage_reviews" ON reviews
  FOR ALL USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  ) WITH CHECK (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- Barbers can read their own reviews
CREATE POLICY "barber_read_own_reviews" ON reviews
  FOR SELECT USING (barber_id = auth.uid());
