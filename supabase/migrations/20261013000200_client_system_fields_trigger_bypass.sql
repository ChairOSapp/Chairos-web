-- Mark done fails in the app: "Card-on-file and visit-history fields
-- can only be changed by server-side automation."
--
-- Root cause: completing an appointment fires update_client_lock(),
-- which updates clients.total_visits / last_visit_date. The clients
-- guard (protect_client_system_fields) exempts only the service role,
-- judged by the request's JWT -- and a trigger chain keeps the end
-- user's JWT even inside a SECURITY DEFINER function. So every
-- browser-side completion (calendar popover "Mark done", dashboard
-- status changes) rolled back, while service-role paths (POS checkout)
-- worked.
--
-- Fix, following the codebase's existing pattern for the profiles
-- guard (app.allow_privileged_profile_update, set by accept_invite):
-- the guard also passes when the transaction-local flag
-- app.client_system_write is 'on', and update_client_lock() raises
-- that flag before writing. Direct browser writes to the guarded
-- fields stay blocked; only this trigger's writes pass.

create or replace function public.protect_client_system_fields()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND current_setting('app.client_system_write', true) IS DISTINCT FROM 'on' THEN
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

create or replace function public.update_client_lock()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  v_new_total_visits integer;
  v_referred_by uuid;
  v_referral_enabled boolean;
  v_first_at_shop boolean;
  v_reward_id uuid;
begin
  if new.status != 'done' then return new; end if;
  if new.barber_id is null then return new; end if;

  -- This function IS the server-side automation the clients guard
  -- (protect_client_system_fields) exists to channel writes through, but
  -- it runs under the end user's JWT, so auth.role() still reads
  -- 'authenticated' and the guard rejects its visit-counter update --
  -- which is why tapping "Mark done" in the app failed with
  -- "Card-on-file and visit-history fields can only be changed by
  -- server-side automation". Raise the same transaction-local flag the
  -- profiles guard uses (set by accept_invite) so the guard recognizes
  -- this write. Browser clients cannot set GUCs through PostgREST.
  perform set_config('app.client_system_write', 'on', true);

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
  where id = v_client_id
  returning total_visits, referred_by_client_id into v_new_total_visits, v_referred_by;

  -- Referral program: gated on this shop having it enabled, since a
  -- welcome-your-code text (or a reward payout) only makes sense where
  -- the owner has actually opted in.
  select referral_program_enabled into v_referral_enabled from shops where id = v_shop_id;

  if v_referral_enabled then
    -- This client's very first completed visit anywhere -- queue their
    -- own "here's your referral code" text.
    if v_new_total_visits = 1 then
      insert into referral_events (client_id, shop_id, event_type)
      values (v_client_id, v_shop_id, 'first_visit');
    end if;

    -- This client was referred, and this is their first completed visit
    -- AT THIS SHOP specifically (a client can have visits elsewhere
    -- already, so total_visits alone isn't the right check here) --
    -- earn the referrer's reward.
    if v_referred_by is not null then
      select count(*) = 1 into v_first_at_shop
      from appointments
      where client_id = v_client_id and shop_id = v_shop_id and status = 'done';

      if v_first_at_shop then
        update referral_rewards
        set status = 'earned', earned_at = now()
        where referring_client_id = v_referred_by
          and referred_client_id = v_client_id
          and shop_id = v_shop_id
          and status = 'pending'
        returning id into v_reward_id;

        if v_reward_id is not null then
          insert into referral_events (client_id, shop_id, event_type, reward_id)
          values (v_referred_by, v_shop_id, 'referral_earned', v_reward_id);
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$function$;
