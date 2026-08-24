-- clients had RLS enabled with only a single owner/staff-scoped SELECT
-- policy -- no INSERT or UPDATE policy existed for any role at all. This
-- silently blocked the public booking flow (app/book/[shopCode]/page.tsx)
-- from ever creating a client record for a first-time visitor, and
-- silently blocked the authenticated dashboard walk-in flow
-- (app/dashboard/chair/page.tsx) the same way. Confirmed live: an
-- anonymous insert with the anon key returned 401 "new row violates
-- row-level security policy for table clients".
--
-- A brand-new client has no existing shop relationship to scope an
-- INSERT/UPDATE check against (that's established afterward via
-- client_shop_memberships / /api/book/membership), so this is
-- necessarily open at the row level -- same tradeoff already accepted
-- for the public appointments INSERT policy. To keep sensitive
-- server-only fields (Square card/customer linkage, visit analytics)
-- out of reach of that open policy, a trigger blocks changes to them
-- unless the caller is the service role.

CREATE POLICY "clients_insert_public"
  ON clients FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "clients_update_public"
  ON clients FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.protect_client_system_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF new.square_customer_id IS DISTINCT FROM old.square_customer_id
       OR new.square_card_id IS DISTINCT FROM old.square_card_id
       OR new.square_card_brand IS DISTINCT FROM old.square_card_brand
       OR new.square_card_last4 IS DISTINCT FROM old.square_card_last4
       OR new.visit_count IS DISTINCT FROM old.visit_count
       OR new.total_visits IS DISTINCT FROM old.total_visits
       OR new.last_visit_date IS DISTINCT FROM old.last_visit_date
    THEN
      RAISE EXCEPTION 'Card-on-file and visit-history fields can only be changed by server-side automation';
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_client_system_fields ON clients;
CREATE TRIGGER trg_protect_client_system_fields
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION public.protect_client_system_fields();
