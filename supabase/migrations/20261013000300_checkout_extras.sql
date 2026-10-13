-- Checkout extras: add-on line items, split payments, quick sales.
--
-- addons: staff-entered items on top of the service price (a product
-- the client bought, an extra charge), each with its own label so a
-- sale never shows up later as a mystery line. Folded into
-- amount_paid at checkout; the jsonb keeps the itemization.
-- payment_split: when the total was paid across two methods, the
-- [{method, amount}] pair. payment_method keeps the larger share.
-- quick_sales: register sales with no appointment (a product sold
-- over the counter, a standalone charge), with note + optional split.
-- Idempotent: safe to run multiple times.

alter table public.appointments
  add column if not exists addons jsonb not null default '[]'::jsonb;

alter table public.appointments
  add column if not exists payment_split jsonb;

create table if not exists public.quick_sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  barber_id uuid,
  amount numeric(10,2) not null,
  tip_amount numeric(10,2) not null default 0,
  payment_method text not null check (
    payment_method in ('square', 'cash', 'venmo', 'zelle', 'cashapp', 'other')
  ),
  payment_split jsonb,
  note text,
  created_by uuid,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_quick_sales_shop_created
  on public.quick_sales (shop_id, created_at desc);

alter table public.quick_sales enable row level security;

drop policy if exists "Owners can manage quick sales" on public.quick_sales;
create policy "Owners can manage quick sales" on public.quick_sales
  for all to public
  using (shop_id in (select id from public.shops where owner_id = auth.uid()))
  with check (shop_id in (select id from public.shops where owner_id = auth.uid()));

drop policy if exists "Barbers can view quick sales in their shop" on public.quick_sales;
create policy "Barbers can view quick sales in their shop" on public.quick_sales
  for select to public
  using (shop_id in (
    select shop_id from public.shop_barbers
    where barber_id = auth.uid() and active = true
  ));

drop policy if exists "Barbers can insert quick sales in their shop" on public.quick_sales;
create policy "Barbers can insert quick sales in their shop" on public.quick_sales
  for insert to public
  with check (shop_id in (
    select shop_id from public.shop_barbers
    where barber_id = auth.uid() and active = true
  ));
