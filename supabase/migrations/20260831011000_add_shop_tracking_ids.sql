-- Shop-level Meta Pixel / Google tag IDs, injected only on that shop's own
-- public booking page (never dashboard/site-wide), so each owner's ad
-- pixel only fires on their own booking traffic.
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS meta_pixel_id text,
  ADD COLUMN IF NOT EXISTS google_tag_id text;
