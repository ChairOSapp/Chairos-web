-- Turns the kiosk from a plain check-in form into a client-facing lobby
-- display: a live walk-in queue, today's open slots per staff member, and
-- owner-configurable theming. There was no kiosk_config table before this
-- (the original kiosk build never shipped a customization option), so this
-- creates it fresh rather than extending anything.
--
-- The queue and open-slots panels need to be visible to anonymous kiosk
-- tablets and update live. walk_ins itself can't be opened up for that --
-- its SELECT policy is staff-only on purpose (client_name/client_phone are
-- PII, and Realtime ships the full row over postgres_changes regardless of
-- column-level grants, so exposing the base table would leak names/phone
-- numbers to anyone at the kiosk). Instead, a trigger mirrors only the
-- safe fields (initials, not full name; no phone at all) into a small
-- public projection table that anon can both read and subscribe to.
-- Appointments have the same PII problem, so open-slots changes are
-- signalled through a separate, content-free "ping" row rather than
-- exposing appointments directly; the kiosk reacts to the ping by
-- re-fetching slots from the existing server-side availability engine.

create table if not exists kiosk_config (
  shop_id uuid primary key references shops(id) on delete cascade,
  display_mode text not null default 'both' check (display_mode in ('off', 'queue', 'slots', 'both')),
  primary_color text,
  accent_color text,
  logo_url text,
  updated_at timestamptz not null default now()
);

alter table kiosk_config enable row level security;

create policy "Owners can manage kiosk config"
  on kiosk_config for all
  using (shop_id in (select id from shops where owner_id = auth.uid()))
  with check (shop_id in (select id from shops where owner_id = auth.uid()));

create policy "Public can view kiosk config"
  on kiosk_config for select
  using (true);

create table if not exists kiosk_queue_public (
  id uuid primary key references walk_ins(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  initials text not null,
  status text not null check (status in ('waiting', 'called')),
  created_at timestamptz not null
);

create index if not exists kiosk_queue_public_shop_id_idx on kiosk_queue_public(shop_id);

alter table kiosk_queue_public enable row level security;

create policy "Public can view kiosk queue"
  on kiosk_queue_public for select
  using (true);

create table if not exists shop_realtime_pings (
  shop_id uuid primary key references shops(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table shop_realtime_pings enable row level security;

create policy "Public can view shop realtime pings"
  on shop_realtime_pings for select
  using (true);

create or replace function public.compute_initials(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      upper(left(split_part(trim(p_name), ' ', 1), 1)) ||
      upper(left(split_part(trim(p_name), ' ', 2), 1)),
      ''
    ),
    '?'
  )
$$;

-- SECURITY DEFINER because the public check-in flow inserts walk_ins as
-- the anon role, which has no write access (and shouldn't get any) to
-- kiosk_queue_public -- without this the trigger's own insert would be
-- blocked by RLS and roll back the customer's check-in.
create or replace function public.sync_kiosk_queue_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.kiosk_queue_public where id = old.id;
    return old;
  end if;

  if new.status in ('waiting', 'called') then
    insert into public.kiosk_queue_public (id, shop_id, initials, status, created_at)
    values (new.id, new.shop_id, public.compute_initials(new.client_name), new.status, new.created_at)
    on conflict (id) do update set status = excluded.status, initials = excluded.initials;
  else
    delete from public.kiosk_queue_public where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists walk_ins_sync_kiosk_queue on walk_ins;
create trigger walk_ins_sync_kiosk_queue
  after insert or update or delete on walk_ins
  for each row execute function public.sync_kiosk_queue_public();

create or replace function public.bump_shop_realtime_ping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid := coalesce(new.shop_id, old.shop_id);
begin
  if v_shop_id is not null then
    insert into public.shop_realtime_pings (shop_id, updated_at)
    values (v_shop_id, now())
    on conflict (shop_id) do update set updated_at = now();
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists appointments_bump_shop_ping on appointments;
create trigger appointments_bump_shop_ping
  after insert or update or delete on appointments
  for each row execute function public.bump_shop_realtime_ping();

drop trigger if exists shop_barbers_bump_shop_ping on shop_barbers;
create trigger shop_barbers_bump_shop_ping
  after insert or update or delete on shop_barbers
  for each row execute function public.bump_shop_realtime_ping();

-- Anon kiosk tablets subscribe to these two projection tables directly;
-- walk_ins and appointments themselves stay out of the publication.
alter publication supabase_realtime add table kiosk_queue_public;
alter publication supabase_realtime add table shop_realtime_pings;
