-- Idempotent shop creation (Bear directive, 2026-10-12).
--
-- create_shop_with_services inserted unconditionally, so an onboarding
-- retry after a mid-flow failure minted a SECOND shop (with its own
-- preset services) for the same owner, and the two shops then shadowed
-- each other across the app. The onboarding page now reuses an existing
-- shop client-side; this makes the RPC itself idempotent as the durable
-- guard: if the caller already owns a shop, return it unchanged and
-- insert nothing.
--
-- Body is the current definition (20260827000003, with service buffers)
-- plus the owner check at the top.
--
-- Amendment (2026-10-12, live-QA find): the preset guard now only raises
-- when the shop would end up with NO services at all. The original guard
-- raised whenever a vertical had no rows in service_presets — even when
-- the owner supplied custom services in onboarding — which bricked shop
-- creation entirely on any database missing its preset seed data (the
-- dev project had none, so every Launch click failed with this raw
-- exception as the user-facing error). Presets-plus-nothing is still a
-- hard stop; presets-missing-but-custom-services is a valid shop.
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
  select * into v_shop
  from public.shops
  where owner_id = auth.uid()
  order by created_at asc
  limit 1;

  if found then
    return v_shop;
  end if;

  insert into public.shops (name, address, city, phone, owner_id, vertical)
  values (p_name, p_address, p_city, p_phone, auth.uid(), p_vertical)
  returning * into v_shop;

  insert into public.services (shop_id, name, price, duration_minutes, deposit_required, buffer_before_minutes, buffer_after_minutes)
  select v_shop.id, sp.name, null, sp.duration_minutes, sp.deposit_required, sp.buffer_before_minutes, sp.buffer_after_minutes
  from public.service_presets sp
  where sp.vertical = p_vertical
  order by sp.sort_order;

  get diagnostics v_preset_count = row_count;
  if v_preset_count = 0
     and (p_custom_services is null or jsonb_array_length(p_custom_services) = 0) then
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
