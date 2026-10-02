-- Staff announcements board (2026-10-02): owners post shop updates,
-- staff read them. Clients never see this table.
-- Safe to run multiple times (IF NOT EXISTS / DROP IF EXISTS guards).

CREATE TABLE IF NOT EXISTS public.shop_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_announcements_shop
  ON public.shop_announcements(shop_id);

CREATE INDEX IF NOT EXISTS idx_shop_announcements_shop_pinned_created
  ON public.shop_announcements(shop_id, pinned DESC, created_at DESC);

ALTER TABLE public.shop_announcements ENABLE ROW LEVEL SECURITY;

-- Owners and active staff of the shop can read.
DROP POLICY IF EXISTS "Owners and staff can view shop announcements" ON public.shop_announcements;
CREATE POLICY "Owners and staff can view shop announcements"
  ON public.shop_announcements FOR SELECT TO public
  USING (
    shop_id IN (SELECT shops.id FROM shops WHERE shops.owner_id = auth.uid())
    OR shop_id IN (
      SELECT shop_barbers.shop_id FROM shop_barbers
      WHERE shop_barbers.barber_id = auth.uid() AND shop_barbers.active = true
    )
  );

-- Only the shop owner can post, edit, pin, or delete.
DROP POLICY IF EXISTS "Owners can manage shop announcements" ON public.shop_announcements;
CREATE POLICY "Owners can manage shop announcements"
  ON public.shop_announcements FOR ALL TO public
  USING (shop_id IN (SELECT shops.id FROM shops WHERE shops.owner_id = auth.uid()))
  WITH CHECK (shop_id IN (SELECT shops.id FROM shops WHERE shops.owner_id = auth.uid()));
