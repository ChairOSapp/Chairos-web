-- Client referral program. clients.source already has a 'referral' enum
-- value (unused until now) and the client portal at /my already exists,
-- so this wires both: an auto-generated referral_code per client, a
-- rewards ledger, a shop-level on/off + reward config, and the DB-side
-- detection of "first completed appointment" events that a Trigger.dev
-- job (src/trigger/referralNotifications.ts) polls to send the actual
-- SMS -- following the same split already used for lapse detection
-- (this migration writes referral_events/lapse_alerts-style facts,
-- the scheduled job does the Twilio call) rather than calling out to
-- Twilio directly from a trigger.

-- ── referral_code: auto-generated on every client insert, regardless of
-- which of the many client-creation code paths runs (online booking,
-- kiosk/walk-in conversion, manual add, calendar quick-book, etc.) --
-- centralizing this in a trigger is the same lesson already applied to
-- total_visits/client_locks in update_client_lock().
alter table public.clients add column referral_code text;
alter table public.clients add column referred_by_client_id uuid references public.clients(id) on delete set null;

create or replace function public.generate_referral_code()
returns trigger
language plpgsql
as $function$
declare
  v_code text;
  v_exists boolean;
begin
  if new.referral_code is not null then return new; end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    select exists(select 1 from public.clients where referral_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  new.referral_code := v_code;
  return new;
end;
$function$;

create trigger set_referral_code
  before insert on public.clients
  for each row execute function public.generate_referral_code();

-- One-time backfill for existing rows (small dataset -- collision risk
-- across a 36^6 code space is negligible at this scale; all future rows
-- go through the trigger's proper check-and-retry loop above).
update public.clients
set referral_code = upper(substr(md5(random()::text || id::text), 1, 6))
where referral_code is null;

alter table public.clients alter column referral_code set not null;
alter table public.clients add constraint clients_referral_code_unique unique (referral_code);

-- ── Shop-level program config (same "plain columns on shops" pattern
-- already used for deposits_enabled/deposit_type/deposit_amount).
alter table public.shops add column referral_program_enabled boolean not null default false;
alter table public.shops add column referral_reward_type text not null default 'percent_off'
  check (referral_reward_type in ('percent_off', 'flat_credit'));
alter table public.shops add column referral_reward_value numeric not null default 10;

-- ── Rewards ledger. Financial-adjacent (drives a real discount), so no
-- public/anon write policy -- every write goes through a service-role
-- API route that validates the referral code, shop settings, and
-- self-referral before touching this table.
create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  referring_client_id uuid not null references public.clients(id) on delete cascade,
  referred_client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'earned', 'redeemed')),
  reward_type text not null check (reward_type in ('percent_off', 'flat_credit')),
  reward_value numeric not null,
  created_at timestamptz not null default now(),
  earned_at timestamptz,
  redeemed_at timestamptz
);

create index referral_rewards_shop_status_idx on public.referral_rewards (shop_id, status);
create index referral_rewards_referring_client_idx on public.referral_rewards (referring_client_id, status);

alter table public.referral_rewards enable row level security;

create policy "referral_rewards_select_shop_staff"
  on public.referral_rewards for select
  to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
    or shop_id in (select shop_id from public.shop_barbers where barber_id = auth.uid() and active = true)
  );

-- ── Referral events: a lightweight outbox the DB trigger writes to and
-- the scheduled Trigger.dev job drains, rather than the trigger itself
-- making an HTTP call. Service-role only, no policies -- nothing in the
-- UI reads this table directly.
create table public.referral_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  event_type text not null check (event_type in ('first_visit', 'referral_earned')),
  reward_id uuid references public.referral_rewards(id) on delete cascade,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index referral_events_unprocessed_idx on public.referral_events (processed_at) where processed_at is null;

alter table public.referral_events enable row level security;

-- ── Resolve a shared referral code to the referring client's id.
-- Minimal return surface (just an id, no PII) so the anonymous public
-- booking page can look this up, same shape as find_client_for_booking.
create or replace function public.resolve_referral_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select id from public.clients where referral_code = upper(p_code) limit 1;
$function$;

grant execute on function public.resolve_referral_code(text) to anon, authenticated;

-- ── Look up an active (earned, unredeemed) reward for a client at a
-- shop, so the booking page can show/apply it. No PII returned.
create or replace function public.get_active_referral_reward(p_client_id uuid, p_shop_id uuid)
returns table(reward_id uuid, reward_type text, reward_value numeric)
language sql
stable
security definer
set search_path to ''
as $function$
  select id, reward_type, reward_value
  from public.referral_rewards
  where referring_client_id = p_client_id
    and shop_id = p_shop_id
    and status = 'earned'
  order by earned_at asc
  limit 1;
$function$;

grant execute on function public.get_active_referral_reward(uuid, uuid) to anon, authenticated;

-- ── Extend the existing "appointment completed" trigger function with
-- referral detection. Pure SQL/data work only (marking rewards earned);
-- the actual SMS send is left to the scheduled job that drains
-- referral_events, matching how lapse_alerts feeds rebooking-sms today.
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
