-- Prevent clients (owners) from changing shops.vertical after shop creation.
-- Vertical can still be set freely on INSERT (initial signup/onboarding);
-- this trigger only blocks UPDATEs unless performed via the service role.
create or replace function public.enforce_shop_vertical_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.vertical is distinct from old.vertical and auth.role() <> 'service_role' then
    raise exception 'shops.vertical is immutable via client — contact support to change it';
  end if;
  return new;
end;
$$;

drop trigger if exists shops_vertical_immutable on public.shops;
create trigger shops_vertical_immutable
before update on public.shops
for each row
execute function public.enforce_shop_vertical_immutable();
