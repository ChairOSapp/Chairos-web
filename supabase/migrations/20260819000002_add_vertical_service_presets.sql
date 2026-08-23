-- Service catalog presets per vertical, applied automatically at shop
-- creation. Presets carry a typical duration only — price is left null so
-- the owner sets it. Consultation (salon, tattoo) defaults deposit_required
-- to false; everything else defaults to true. This flag has no effect until
-- the Phase 4 deposit toggle ships, but is set correctly now so that
-- feature doesn't need a backfill.
alter table public.services
  add column if not exists deposit_required boolean not null default true;

create table if not exists public.service_presets (
  vertical text not null references public.vertical_config(vertical),
  name text not null,
  duration_minutes integer not null,
  deposit_required boolean not null default true,
  sort_order integer not null default 0,
  primary key (vertical, name)
);

alter table public.service_presets enable row level security;

drop policy if exists service_presets_select_authenticated on public.service_presets;
create policy service_presets_select_authenticated
  on public.service_presets for select
  to authenticated
  using (true);

insert into public.service_presets (vertical, name, duration_minutes, deposit_required, sort_order) values
  ('barbershop','Precision Haircut',30,true,1),
  ('barbershop','Fade',30,true,2),
  ('barbershop','Cut + Beard Sculpt',45,true,3),
  ('barbershop','Beard Sculpt',30,true,4),
  ('barbershop','Hot Towel Shave',30,true,5),
  ('barbershop','Line-Up / Edge-Up',15,true,6),
  ('barbershop','Youth Cut',30,true,7),
  ('barbershop','VIP Experience',75,true,8),
  ('salon','Consultation',20,false,1),
  ('salon','Cut',45,true,2),
  ('salon','Color',90,true,3),
  ('salon','Highlights',120,true,4),
  ('salon','Blowout',30,true,5),
  ('salon','Treatment',30,true,6),
  ('tattoo','Consultation',20,false,1),
  ('tattoo','Session (hourly)',60,true,2),
  ('tattoo','Touch-up',30,true,3),
  ('tattoo','Piercing',15,true,4)
on conflict (vertical, name) do nothing;

-- Wraps shop creation + preset service seeding (+ any owner-added custom
-- services from onboarding) in one transaction, so a partial failure
-- (e.g. mid-request disconnect) cannot leave a shop with zero services.
-- SECURITY INVOKER so the existing "Owners can insert shop" /
-- "Owners can manage services" RLS policies do the authorization —
-- owner_id is taken from auth.uid(), never from the caller.
create or replace function public.create_shop_with_services(
  p_name text,
  p_address text,
  p_city text,
  p_phone text,
  p_vertical text,
  p_custom_services jsonb default '[]'::jsonb
)
returns public.shops
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shop public.shops;
  v_preset_count integer;
begin
  insert into public.shops (name, address, city, phone, owner_id, vertical)
  values (p_name, p_address, p_city, p_phone, auth.uid(), p_vertical)
  returning * into v_shop;

  insert into public.services (shop_id, name, price, duration_minutes, deposit_required)
  select v_shop.id, sp.name, null, sp.duration_minutes, sp.deposit_required
  from public.service_presets sp
  where sp.vertical = p_vertical
  order by sp.sort_order;

  get diagnostics v_preset_count = row_count;
  if v_preset_count = 0 then
    raise exception 'No service presets configured for vertical %', p_vertical;
  end if;

  if p_custom_services is not null and jsonb_array_length(p_custom_services) > 0 then
    insert into public.services (shop_id, name, price, duration_minutes, description)
    select
      v_shop.id,
      x->>'name',
      nullif(x->>'price', '')::numeric,
      nullif(x->>'duration_minutes', '')::integer,
      x->>'description'
    from jsonb_array_elements(p_custom_services) as x;
  end if;

  return v_shop;
end;
$$;

revoke all on function public.create_shop_with_services(text, text, text, text, text, jsonb) from public;
grant execute on function public.create_shop_with_services(text, text, text, text, text, jsonb) to authenticated;
