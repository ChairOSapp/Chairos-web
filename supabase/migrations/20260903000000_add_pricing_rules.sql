-- Pricing rules: recurring day/time pricing (peak/off-peak) and
-- date-range promos ("20% off all of September"), on one table.
--
-- A rule is a promo when start_date/end_date are set (active only within
-- that window); a rule without them is permanent/recurring, gated instead
-- by days_of_week/start_time/end_time. Exactly one of flat_price /
-- percent_adjustment defines the adjustment: flat_price overrides the
-- service price outright, percent_adjustment nudges it by a signed
-- percentage (negative = discount, positive = surcharge).
create table if not exists pricing_rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  service_id uuid references services(id) on delete cascade,
  name text not null,
  promo_name text,
  days_of_week text[],
  start_time time,
  end_time time,
  start_date date,
  end_date date,
  flat_price numeric,
  percent_adjustment numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pricing_rules_one_adjustment check (num_nonnulls(flat_price, percent_adjustment) = 1),
  constraint pricing_rules_date_range check ((start_date is null) = (end_date is null)),
  constraint pricing_rules_date_order check (start_date is null or end_date is null or start_date <= end_date)
);

create index if not exists pricing_rules_shop_id_idx on pricing_rules(shop_id);
create index if not exists pricing_rules_service_id_idx on pricing_rules(service_id);

alter table pricing_rules enable row level security;

create policy "Owners can manage pricing rules"
  on pricing_rules for all
  using (shop_id in (select id from shops where owner_id = auth.uid()))
  with check (shop_id in (select id from shops where owner_id = auth.uid()));

create policy "Public can view active pricing rules"
  on pricing_rules for select
  using (active = true);
