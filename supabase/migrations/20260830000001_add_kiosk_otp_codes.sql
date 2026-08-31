-- Kiosk check-in now requires verifying phone ownership via a texted
-- one-time code before a walk_ins row is created, instead of trusting
-- whatever name+phone someone types on a shared public tablet. This
-- table holds the pending check-in (name/phone/requested barber/service)
-- alongside the code while it waits to be verified; the row is deleted
-- once verified (walk_ins gets the real row) or once it expires.
--
-- Service-role only, like staff_tax_info and consent_form_signatures --
-- there is no authenticated user tied to an anonymous walk-in's phone
-- number to scope a policy to, and the only access path is the two
-- API routes (app/api/kiosk/otp/send, app/api/kiosk/otp/verify), which
-- both use the service-role client and do their own shop_code -> shop_id
-- validation before touching this table. RLS is enabled with zero
-- policies so anon/authenticated get nothing at all.

create table public.kiosk_otp_codes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  name text not null,
  requested_barber_id uuid references public.profiles(id),
  service_id uuid references public.services(id),
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (shop_id, phone)
);

alter table public.kiosk_otp_codes enable row level security;
