-- The Google reviews import route (app/api/reviews/import-google) has always
-- upserted with onConflict: 'shop_id,reviewer_name,review_date', but no
-- unique constraint on that column combination ever existed -- every import
-- attempt failed at the database layer with 42P10 ("no unique or exclusion
-- constraint matching the ON CONFLICT specification"), confirmed by
-- reproducing the exact error directly against production before writing
-- this migration. This is the second of two independent root causes for the
-- import feature never having worked (the first being the route calling the
-- legacy Places API, which isn't enabled for this Google Cloud project).
create unique index if not exists reviews_shop_reviewer_date_idx
  on public.reviews (shop_id, reviewer_name, review_date);
