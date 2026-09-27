-- Client import (CSV) + Square payment history seeding
-- 2026-09-27: owners can import clients from other apps via CSV, and pull
-- past Square payments so a new shop has real history from day one.

-- Log of every import run (CSV or Square)
create table if not exists public.client_imports (
  id uuid default gen_random_uuid() primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid,
  filename text,
  source text not null default 'csv',
  total_rows integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists client_imports_shop_id_idx on public.client_imports(shop_id);

-- Historical Square payments pulled per shop (pre-ChairOS sales history).
-- square_payment_id is unique per shop so re-syncs are idempotent.
create table if not exists public.square_payment_history (
  id uuid default gen_random_uuid() primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  square_payment_id text not null,
  amount_cents integer not null default 0,
  currency text not null default 'USD',
  status text,
  paid_at timestamptz,
  buyer_email text,
  buyer_name text,
  location_id text,
  synced_at timestamptz not null default now(),
  unique(shop_id, square_payment_id)
);
create index if not exists square_payment_history_shop_id_idx on public.square_payment_history(shop_id);
create index if not exists square_payment_history_paid_at_idx on public.square_payment_history(shop_id, paid_at);

alter table public.client_imports enable row level security;
alter table public.square_payment_history enable row level security;

-- Owners can read their own shops' import logs and payment history.
-- (Writes go through service-role API routes; RLS is defense in depth.)
drop policy if exists "owners read own import logs" on public.client_imports;
create policy "owners read own import logs" on public.client_imports
  for select using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

drop policy if exists "owners read own payment history" on public.square_payment_history;
create policy "owners read own payment history" on public.square_payment_history
  for select using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );
