-- Per-service setup/cleanup buffers (tattoo Session needs turnaround time
-- between artists' bookings; barbershop/salon default to 0, no behavior
-- change for existing services).
alter table public.services
  add column if not exists buffer_before_minutes integer not null default 0,
  add column if not exists buffer_after_minutes integer not null default 0;

alter table public.service_presets
  add column if not exists buffer_before_minutes integer not null default 0,
  add column if not exists buffer_after_minutes integer not null default 0;

-- Tattoo Session preset gets a realistic setup/cleanup buffer; every other
-- preset (including tattoo Consultation/Touch-up/Piercing) stays at 0.
update public.service_presets
set buffer_before_minutes = 15, buffer_after_minutes = 15
where vertical = 'tattoo' and name = 'Session (hourly)';

-- Carry buffer_before/after through from the preset when create_shop_with_services
-- seeds a new shop's services, so tattoo shops get the Session buffer from day one.
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

  insert into public.services (shop_id, name, price, duration_minutes, deposit_required, buffer_before_minutes, buffer_after_minutes)
  select v_shop.id, sp.name, null, sp.duration_minutes, sp.deposit_required, sp.buffer_before_minutes, sp.buffer_after_minutes
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
