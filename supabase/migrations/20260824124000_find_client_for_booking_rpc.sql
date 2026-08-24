-- The public booking page needs to look up an existing client by phone
-- (to avoid creating a duplicate on a repeat visit, and to pre-select
-- their locked barber -- the Client Lock feature) before any shop
-- relationship exists to scope a direct SELECT against. clients' SELECT
-- policy is intentionally owner/staff-scoped (it holds PII), so a direct
-- anonymous select always returned nothing. This SECURITY DEFINER
-- function returns only the minimal fields the booking flow actually
-- uses, keyed strictly by an exact phone match -- it doesn't let an
-- anonymous caller browse or search client PII more broadly than that.
CREATE OR REPLACE FUNCTION public.find_client_for_booking(p_phone text, p_shop_id uuid)
RETURNS TABLE(
  client_id uuid,
  full_name text,
  total_visits integer,
  sms_consent boolean,
  email_consent boolean,
  locked_barber_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    c.id,
    c.full_name,
    c.total_visits,
    c.sms_consent,
    c.email_consent,
    (
      SELECT cl.barber_id
      FROM public.client_locks cl
      WHERE cl.client_id = c.id AND cl.shop_id = p_shop_id AND cl.locked = true
      LIMIT 1
    )
  FROM public.clients c
  WHERE c.phone = p_phone
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_client_for_booking(text, uuid) TO anon, authenticated;
