-- Business-level payer info for the unofficial 1099-style earnings summary.
-- Lives on shops (not a separate table) because a solo chair's own
-- auto-provisioned shop already covers that case — there is no distinct
-- "solo chair" schema in this app (see app/dashboard/chair/page.tsx, every
-- barber including solo ones resolves through a shop_barbers row). Covered
-- by the existing owner-update RLS policy on shops already, no new policy
-- needed here.
alter table public.shops
  add column if not exists legal_business_name text,
  add column if not exists business_address text,
  add column if not exists ein text;

-- Personal recipient tax info, one row per person (not per shop-membership —
-- a legal name/TIN doesn't change depending on where someone works).
create table if not exists public.staff_tax_info (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null unique references auth.users(id) on delete cascade,
  legal_name text,
  address text,
  tin text,
  updated_at timestamptz not null default now()
);

alter table public.staff_tax_info enable row level security;

-- Deliberately no owner-facing SELECT policy at all, mirroring the
-- no-client-read-path shape already used for consent_form_signatures
-- (20260827000001_add_consent_forms.sql) -- there, writes are service-role
-- only; here, owner *reads* are service-role only. The only way an owner's
-- request can ever see this row is through the report-generation API route
-- (app/api/reports/earnings-summary), which uses the service-role client
-- and enforces its own owner+shop_barbers permission check. There is no
-- `select * from staff_tax_info where shop...` an owner can run to browse
-- the roster -- generating one person's report is the only access path.
drop policy if exists "Staff can view own tax info" on public.staff_tax_info;
create policy "Staff can view own tax info" on public.staff_tax_info for select
  using (barber_id = auth.uid());

drop policy if exists "Staff can insert own tax info" on public.staff_tax_info;
create policy "Staff can insert own tax info" on public.staff_tax_info for insert
  with check (barber_id = auth.uid());

drop policy if exists "Staff can update own tax info" on public.staff_tax_info;
create policy "Staff can update own tax info" on public.staff_tax_info for update
  using (barber_id = auth.uid()) with check (barber_id = auth.uid());
