-- vertical_config only ever holds generic, non-sensitive per-vertical
-- labels/thresholds (e.g. staff_label "Artist" for vertical "tattoo") --
-- the same 3 rows regardless of which shop is asking. It was scoped to
-- {authenticated} only, but the public anonymous booking page
-- (app/book/[shopCode]/page.tsx) reads it too, using the anon role, to
-- pick the right staff noun ("Choose your artist" vs "...barber"). RLS
-- silently returned zero rows for anon callers, so the page always fell
-- back to its "Barber" default regardless of the shop's real vertical.
-- Matches the {public} SELECT pattern already used by shops, services,
-- shop_barbers, and reviews for this same booking page.
DROP POLICY "vertical_config_select_authenticated" ON vertical_config;

CREATE POLICY "vertical_config_select_public"
  ON vertical_config FOR SELECT
  TO public
  USING (true);
