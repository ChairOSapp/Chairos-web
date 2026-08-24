ALTER FUNCTION stripe.set_updated_at() SET search_path = '';
ALTER FUNCTION stripe.set_updated_at_metadata() SET search_path = '';
ALTER FUNCTION stripe.check_rate_limit(rate_key text, max_requests integer, window_seconds integer) SET search_path = '';
