-- Update shops_public to include all columns the public booking page needs,
-- then restrict the base shops table's public SELECT policy.
-- The view remains the only public read path; the base table policy
-- is narrowed to authenticated shop members.

-- Refresh the view with the additional booking-page columns.
create or replace view public.shops_public as
select
  id, shop_code, name, slug, vertical, bio, phone, contact_email,
  address, city, brand_color, logo_url, hero_url, hours,
  require_card_to_book, require_consent_form, deposits_enabled,
  deposit_type, deposit_amount, deposit_refund_window_hours,
  min_advance_minutes, max_advance_days, cancellation_window_hours,
  cancellation_policy, slot_interval_minutes,
  meta_pixel_id, google_tag_id,
  created_at
from public.shops;

-- Ensure public read on the view (idempotent).
grant select on public.shops_public to anon, authenticated;

-- Drop the permissive public SELECT on the base table that exposed
-- ALL columns (including ein, legal_business_name, tax fields).
drop policy if exists "Public can view shops by code" on public.shops;

-- Replacement: authenticated users can read shops they belong to
-- (owner or active staff). Anonymous booking flows must use
-- shops_public instead.
create policy "shops_select_members"
  on public.shops for select
  to authenticated
  using (
    owner_id = auth.uid()
    or id in (
      select shop_id from public.shop_barbers
      where barber_id = auth.uid() and active = true
    )
  );
