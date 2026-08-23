-- Deposit settings live on shops (owner-configured) and per-service
-- (services.deposit_required, added previously — Consultation defaults false).
-- Gate for "does this booking need a deposit" is computed in application
-- code as: vertical = 'tattoo' (always) OR (vertical = 'salon' AND
-- shops.deposits_enabled) — AND services.deposit_required. Barbershop never
-- offers deposits, so no column is needed to special-case it.
alter table public.shops
  add column if not exists deposits_enabled boolean not null default false,
  add column if not exists deposit_type text not null default 'percent' check (deposit_type in ('flat','percent')),
  add column if not exists deposit_amount numeric not null default 20,
  add column if not exists deposit_refund_window_hours integer not null default 48;

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id),
  shop_id uuid not null references public.shops(id),
  amount numeric not null,
  type text not null check (type in ('flat','percent')),
  status text not null default 'pending' check (status in ('pending','paid','refunded','expired')),
  square_payment_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz
);

create index if not exists deposits_appointment_id_idx on public.deposits(appointment_id);
create index if not exists deposits_shop_id_idx on public.deposits(shop_id);
-- Scan target for the 5-minute expiration job: only pending, unexpired-check rows.
create index if not exists deposits_pending_expiry_idx on public.deposits(expires_at) where status = 'pending';

alter table public.deposits enable row level security;

-- Deposits touch payment data, so — unlike services — there is no public/anon
-- policy at all. Booking-time deposit creation and the Square webhook both go
-- through service-role server routes, which bypass RLS entirely.
drop policy if exists "Owners can manage shop deposits" on public.deposits;
create policy "Owners can manage shop deposits" on public.deposits for all
  using (shop_id in (select id from shops where owner_id = auth.uid()));
