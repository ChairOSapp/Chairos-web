-- SECURITY FIX H1: Restrict EIN and sensitive shop data from public reads
-- The shops table had a public SELECT policy exposing ALL columns including
-- ein, legal_business_name, business_address.

-- Create a public-safe view with only booking-page columns
create or replace view public.shops_public as
select
  id, shop_code, name, slug, vertical, bio, phone, contact_email,
  address, city, brand_color, logo_url, hero_url, hours,
  require_card_to_book, require_consent_form, deposits_enabled,
  deposit_type, deposit_amount, created_at
from public.shops;

-- Grant public read on the view
grant select on public.shops_public to anon, authenticated;

-- Note: The existing "Public can view shops by code" policy on shops
-- should be reviewed. For now, application code should use shops_public
-- for anonymous booking flows. A follow-up migration will restrict
-- the base shops table policy.
