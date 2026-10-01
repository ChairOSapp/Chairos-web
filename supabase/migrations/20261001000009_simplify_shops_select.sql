-- Simplify shops SELECT policies: straightforward owner check.
-- Barbers access their shop via the shop_barbers public policy, not here.

drop policy if exists "Owners can view own shop" on public.shops;
drop policy if exists "shops_select_members" on public.shops;
drop policy if exists "shops_select_owner_or_staff" on public.shops;

create policy "shops_select_authenticated_owner"
  on public.shops for select
  to authenticated
  using (owner_id = auth.uid());
