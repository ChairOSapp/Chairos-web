-- Staff announcements board v2 (2026-10-02): photo attachments.
-- Run AFTER v1 (20261002000005). All guards idempotent — safe on top of v1.

-- One photo per post (e.g. flyers for staff to use/share).
ALTER TABLE public.shop_announcements
  ADD COLUMN IF NOT EXISTS image_url text;

-- Private bucket for announcement flyers. Reads are member-scoped
-- (owners + active staff of the shop in the path's first segment,
-- mirroring the shop_announcements table RLS); uploads go through the
-- /api/shop/upload-asset server route with the service role, which
-- verifies ownership once via request cookies. The board's GET route
-- mints short-lived signed URLs per view, so no public URL ever exists.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-images', 'announcement-images', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Member-scoped read: owners and active staff of the shop in the path.
-- Path convention: {shop_id}/announcements/{uuid}.
drop policy if exists "Public can view announcement images" on storage.objects;
drop policy if exists "Shop owners and staff can view announcement images" on storage.objects;
create policy "Shop owners and staff can view announcement images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'announcement-images'
    and (
      (string_to_array(name, '/'))[1]::uuid in (select shops.id from shops where shops.owner_id = auth.uid())
      or (string_to_array(name, '/'))[1]::uuid in (
        select shop_barbers.shop_id from shop_barbers
        where shop_barbers.barber_id = auth.uid() and shop_barbers.active = true
      )
    )
  );

-- Owner-only writes; path must start with a shop they own.
-- Path convention: {shop_id}/announcements/{uuid}.
drop policy if exists "Owners can upload announcement images" on storage.objects;
create policy "Owners can upload announcement images" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'announcement-images'
    and public.shop_member_role(
      (string_to_array(name, '/'))[1]::uuid,
      auth.uid()
    ) = 'owner'
  );

drop policy if exists "Owners can update announcement images" on storage.objects;
create policy "Owners can update announcement images" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'announcement-images'
    and public.shop_member_role(
      (string_to_array(name, '/'))[1]::uuid,
      auth.uid()
    ) = 'owner'
  );

drop policy if exists "Owners can delete announcement images" on storage.objects;
create policy "Owners can delete announcement images" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'announcement-images'
    and public.shop_member_role(
      (string_to_array(name, '/'))[1]::uuid,
      auth.uid()
    ) = 'owner'
  );
