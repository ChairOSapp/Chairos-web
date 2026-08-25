-- Minimal public kiosk check-in feature. A customer at a physical
-- kiosk/tablet in the shop checks in without an account; staff see the
-- queue and convert an entry into a real appointment when service
-- starts. No PII is exposed publicly -- the live-status page reads
-- through a SECURITY DEFINER RPC (same pattern as
-- find_client_for_booking) rather than a public SELECT policy, so no
-- customer can see another customer's name/phone or the full queue.

CREATE TABLE walk_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  requested_barber_id uuid REFERENCES profiles(id),
  service_id uuid REFERENCES services(id),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'in_service', 'done', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX walk_ins_shop_status_idx ON walk_ins (shop_id, status, created_at);

ALTER TABLE walk_ins ENABLE ROW LEVEL SECURITY;

-- Public (anon) can create a check-in -- same open-INSERT tradeoff
-- already accepted for clients/appointments, since a brand-new walk-in
-- has no shop relationship yet to scope a check against. The API route
-- validates shop_code -> shop_id server-side before this insert runs.
CREATE POLICY "walk_ins_insert_public"
  ON walk_ins FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "walk_ins_select_shop_staff"
  ON walk_ins FOR SELECT
  TO authenticated
  USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
    OR shop_id IN (SELECT shop_id FROM shop_barbers WHERE barber_id = auth.uid() AND active = true)
  );

CREATE POLICY "walk_ins_update_shop_staff"
  ON walk_ins FOR UPDATE
  TO authenticated
  USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
    OR shop_id IN (SELECT shop_id FROM shop_barbers WHERE barber_id = auth.uid() AND active = true)
  )
  WITH CHECK (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
    OR shop_id IN (SELECT shop_id FROM shop_barbers WHERE barber_id = auth.uid() AND active = true)
  );

CREATE OR REPLACE FUNCTION public.get_walkin_status(p_id uuid)
RETURNS TABLE(status text, queue_position integer, shop_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    w.status,
    (
      SELECT count(*)::integer
      FROM public.walk_ins w2
      WHERE w2.shop_id = w.shop_id
        AND w2.status = 'waiting'
        AND w2.created_at < w.created_at
    ),
    s.name
  FROM public.walk_ins w
  JOIN public.shops s ON s.id = w.shop_id
  WHERE w.id = p_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_walkin_status(uuid) TO anon, authenticated;
