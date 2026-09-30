-- Booking rules engine (Task 1 — open-source inspired: cal.com + easyappointments)
-- 2026-09-29: shop-level booking rules as columns on shops (matches the
-- existing deposit_refund_window_hours / waitlist_min_notice_hours pattern),
-- a one-off closure-dates table, and a late-cancel flag on appointments.

alter table public.shops
  add column if not exists min_advance_minutes integer not null default 120,
  add column if not exists max_advance_days integer not null default 90,
  add column if not exists cancellation_window_hours integer not null default 24,
  add column if not exists slot_interval_minutes integer not null default 30;

alter table public.appointments
  add column if not exists late_cancel boolean not null default false;

-- One-off exceptions to the weekly working plan (vacation, sick day,
-- holiday). A row with is_closed = true closes the whole date; the note
-- is owner-facing ("Christmas — closed").
create table if not exists public.shop_date_exceptions (
  id uuid default gen_random_uuid() primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  unique(shop_id, date)
);
create index if not exists shop_date_exceptions_shop_date_idx on public.shop_date_exceptions(shop_id, date);

alter table public.shop_date_exceptions enable row level security;

-- Owners manage their own shops' closure dates (settings UI writes go
-- through the owner session; the public availability route reads via
-- service role, which bypasses RLS).
drop policy if exists "owners manage own date exceptions" on public.shop_date_exceptions;
create policy "owners manage own date exceptions" on public.shop_date_exceptions
  for all using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );
