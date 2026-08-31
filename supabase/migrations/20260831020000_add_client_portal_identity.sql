-- Identity layer for the client-facing portal, decoupled from `clients`
-- (which is shop-CRM-owned and shop-scoped via client_shop_memberships).
-- clients.phone is already globally unique, so resolving a phone number to
-- its one clients row + every shop membership is a simple join -- this
-- table exists to hold portal-specific state (login history) without
-- touching the CRM table shops directly edit.
create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.client_accounts enable row level security;
create policy "service role only" on public.client_accounts using (false);

-- Same hash/expiry/attempts pattern as kiosk_otp_codes, but phone-only
-- (no shop_id) since portal login is client-identity-first, not
-- shop-first -- a client logs in once and sees every shop they have a
-- relationship with.
create table if not exists public.client_portal_otp_codes (
  phone text primary key,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.client_portal_otp_codes enable row level security;
create policy "service role only" on public.client_portal_otp_codes using (false);

-- Tag portal-driven bookings distinctly, same reasoning as source='recovery'.
alter table appointments drop constraint if exists appointments_source_check;
alter table appointments add constraint appointments_source_check
  check (source in ('walk_in', 'online_booking', 'referral', 'campaign', 'manual', 'recovery', 'portal'));
