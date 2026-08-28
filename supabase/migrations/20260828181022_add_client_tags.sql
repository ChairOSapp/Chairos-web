CREATE TABLE client_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  shop_id uuid REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  tag text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON client_tags(shop_id);
CREATE INDEX ON client_tags(client_id);
CREATE UNIQUE INDEX ON client_tags(client_id, shop_id, tag);

ALTER TABLE client_tags ENABLE ROW LEVEL SECURITY;

-- Owner: full management scoped to their own shop
CREATE POLICY "owner_manage_client_tags" ON client_tags
  FOR ALL USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  ) WITH CHECK (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- Staff (barbers) at the shop can read and add tags too (e.g. "color
-- client", "VIP" noted by whoever's working with them), same trust model
-- as client_notes already uses for shop staff.
CREATE POLICY "staff_read_client_tags" ON client_tags
  FOR SELECT USING (
    shop_id IN (SELECT shop_id FROM shop_barbers WHERE barber_id = auth.uid() AND active = true)
  );

CREATE POLICY "staff_insert_client_tags" ON client_tags
  FOR INSERT WITH CHECK (
    shop_id IN (SELECT shop_id FROM shop_barbers WHERE barber_id = auth.uid() AND active = true)
  );
