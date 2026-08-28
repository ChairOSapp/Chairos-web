-- Investigated: visit_count is never incremented by any app code or DB
-- function -- the only write to it is a hardcoded 0 at client-creation
-- inside update_client_lock(). The 30/94 clients with a nonzero
-- visit_count all have it set to the exact same value as total_visits,
-- consistent with old seed data inserting both columns identically at
-- creation time; nothing has kept visit_count in sync since. total_visits
-- is the only field actually read anywhere in the app (5 files) and the
-- only one incremented on every completed appointment. Consolidating to
-- total_visits as sole authoritative field.

CREATE OR REPLACE FUNCTION public.update_client_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_client_id uuid;
  v_barber_id uuid;
  v_shop_id uuid;
  v_booking_count integer;
  v_first_booking date;
  v_last_booking date;
  v_months_consecutive numeric;
  v_locked boolean;
  v_loyalty boolean;
  v_lock_threshold integer;
  v_loyalty_months integer;
begin
  if new.status != 'done' then return new; end if;
  if new.barber_id is null then return new; end if;

  v_barber_id := new.barber_id;
  v_shop_id := new.shop_id;

  if new.client_id is not null then
    v_client_id := new.client_id;
  else
    -- Match by phone first
    select id into v_client_id from clients
    where phone = new.client_phone limit 1;

    -- If not found by phone, try email
    if v_client_id is null and new.client_email is not null then
      select id into v_client_id from clients
      where email = new.client_email limit 1;
    end if;

    -- If still not found, create new client
    if v_client_id is null then
      insert into clients (full_name, phone, email)
      values (new.client_name, new.client_phone, new.client_email)
      on conflict (email) do update set phone = excluded.phone
      returning id into v_client_id;
    end if;

    if v_client_id is null then
      select id into v_client_id from clients
      where email = new.client_email limit 1;
    end if;

    update appointments set client_id = v_client_id where id = new.id;
  end if;

  -- Load this shop's vertical thresholds. Fall back to the prior hardcoded
  -- values (2 / 12) if the shop's vertical has no matching config row, so
  -- behavior is unchanged in that edge case rather than failing closed.
  select vc.lock_threshold_bookings, vc.loyalty_months_required
  into v_lock_threshold, v_loyalty_months
  from shops s
  join vertical_config vc on vc.vertical = s.vertical
  where s.id = v_shop_id;

  if v_lock_threshold is null then v_lock_threshold := 2; end if;
  if v_loyalty_months is null then v_loyalty_months := 12; end if;

  select booking_count, first_booking_date, last_booking_date
  into v_booking_count, v_first_booking, v_last_booking
  from client_locks
  where client_id = v_client_id
    and barber_id = v_barber_id
    and shop_id = v_shop_id;

  if not found then
    v_booking_count := 0;
    v_first_booking := new.date;
  end if;

  v_booking_count := v_booking_count + 1;
  v_last_booking := new.date;

  v_locked := v_booking_count >= v_lock_threshold;

  if v_first_booking is not null and v_last_booking is not null then
    v_months_consecutive := (v_last_booking - v_first_booking)::numeric / 30.44;
    v_loyalty := v_months_consecutive >= v_loyalty_months and v_locked;
  else
    v_loyalty := false;
  end if;

  insert into client_locks (
    client_id, barber_id, shop_id,
    booking_count, first_booking_date, last_booking_date,
    locked, loyalty_protected, updated_at
  ) values (
    v_client_id, v_barber_id, v_shop_id,
    v_booking_count, v_first_booking, v_last_booking,
    v_locked, v_loyalty, now()
  )
  on conflict (client_id, barber_id, shop_id)
  do update set
    booking_count = v_booking_count,
    last_booking_date = v_last_booking,
    locked = v_locked,
    loyalty_protected = v_loyalty,
    updated_at = now();

  update clients set
    total_visits = total_visits + 1,
    last_visit_date = new.date
  where id = v_client_id;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_client_system_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF new.square_customer_id IS DISTINCT FROM old.square_customer_id
       OR new.square_card_id IS DISTINCT FROM old.square_card_id
       OR new.square_card_brand IS DISTINCT FROM old.square_card_brand
       OR new.square_card_last4 IS DISTINCT FROM old.square_card_last4
       OR new.total_visits IS DISTINCT FROM old.total_visits
       OR new.last_visit_date IS DISTINCT FROM old.last_visit_date
    THEN
      RAISE EXCEPTION 'Card-on-file and visit-history fields can only be changed by server-side automation';
    END IF;
  END IF;
  RETURN new;
END;
$function$;

ALTER TABLE clients DROP COLUMN visit_count;
