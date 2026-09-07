-- Guarded: the `stripe` schema is bootstrapped outside migration history
-- (Stripe Sync Engine, provisioned directly against production), so a fresh
-- database replaying full migration history -- e.g. a new Supabase branch --
-- doesn't have it. Skip cleanly instead of hard-failing the whole replay.
DO $guard$
BEGIN
  IF to_regprocedure('stripe.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION stripe.set_updated_at() SET search_path = ''''';
  END IF;
  IF to_regprocedure('stripe.set_updated_at_metadata()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION stripe.set_updated_at_metadata() SET search_path = ''''';
  END IF;
  IF to_regprocedure('stripe.check_rate_limit(text, integer, integer)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION stripe.check_rate_limit(text, integer, integer) SET search_path = ''''';
  END IF;
END $guard$;
