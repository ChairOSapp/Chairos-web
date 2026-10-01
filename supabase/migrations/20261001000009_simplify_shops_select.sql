-- Simplify shops SELECT policies: one clear policy for owners and staff.
-- Drops the two overlapping policies and replaces with a single one.

drop policy if exists "Owners can view own shop" on public.shops;
drop policy if exists "shops_select_members" on public.shops;

create policy "shops_select_owner_or_staff"
  on public.shops for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.shop_barbers
      where shop_barbers.shop_id = shops.id
      and shop_barbers.barber_id = auth.uid()
      and shop_barbers.active = true
    )
  );
