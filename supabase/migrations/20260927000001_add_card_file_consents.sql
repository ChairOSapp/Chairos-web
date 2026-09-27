-- Card-on-file consent records. Every card saved on file (client cards for
-- booking/portal/POS, barber cards for booth rent) must have an explicit
-- consent record: the exact disclosure text the person agreed to, when, and
-- what the card may be charged for. Card-network stored-credential rules
-- require this disclosure + affirmative consent before any future charge.
create table if not exists public.card_file_consents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  holder_type text not null check (holder_type in ('client', 'barber')),
  client_id uuid references public.clients(id),
  shop_barber_id uuid references public.shop_barbers(id),
  square_customer_id text,
  square_card_id text,
  consent_scope text not null,
  consent_text text not null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists card_file_consents_shop_id_idx on public.card_file_consents(shop_id);
create index if not exists card_file_consents_client_id_idx on public.card_file_consents(client_id) where client_id is not null;
create index if not exists card_file_consents_shop_barber_id_idx on public.card_file_consents(shop_barber_id) where shop_barber_id is not null;

alter table public.card_file_consents enable row level security;

-- Consent rows touch payment data: no public/anon policy. Server routes use
-- the service role and bypass RLS; owners can review their own shop's rows.
drop policy if exists "Owners can manage card consents" on public.card_file_consents;
create policy "Owners can manage card consents" on public.card_file_consents for all
  using (shop_id in (select id from shops where owner_id = auth.uid()));
