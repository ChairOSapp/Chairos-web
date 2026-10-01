-- Lock down walk_ins INSERT: drop the permissive public policy.
-- Kiosk walk-ins are created server-side in /api/kiosk/otp/verify
-- (after OTP verification, using the service role). No legitimate
-- client-side insert exists.

drop policy if exists "walk_ins_insert_public" on public.walk_ins;
drop policy if exists walk_ins_insert_public on public.walk_ins;

create policy "notifications_insert_shop_member"
  on public.notifications for insert
  to authenticated
  with check (
    -- The inserter must belong to the shop (owner or active staff)...
    exists (
      select 1 from public.shops s
      where s.id = notifications.shop_id
        and (
          s.owner_id = auth.uid()
          or exists (
            select 1 from public.shop_barbers sb
            where sb.shop_id = s.id
              and sb.barber_id = auth.uid()
              and sb.active = true
          )
        )
    )
    -- ...and the target must be that shop's owner or staff.
    and (
      notifications.user_id in (select owner_id from public.shops where id = notifications.shop_id)
      or notifications.user_id in (
        select barber_id from public.shop_barbers
        where shop_id = notifications.shop_id and barber_id is not null
      )
    )
  );
