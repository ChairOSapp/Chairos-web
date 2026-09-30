-- Portfolio galleries for shop booking pages.
--
-- Shops (barbershops/salons/tattoo studios) are visual businesses: a
-- swipeable before/after portfolio on the public booking page converts
-- better than a service list alone.
--
-- Storage: public `portfolio` bucket, path convention {shop_id}/{uuid}.{ext}.
-- Uploads go through the /api/shop/portfolio server route (service role),
-- which verifies shop management once via the request cookies. RLS below
-- is the backstop: public read, authenticated writes scoped to shops the
-- caller manages.
--
-- Table: portfolio_photos links each photo to a shop and optionally a
-- specific barber (shop_barbers.barber_id -> auth user, or null for
-- shop-wide). sort_order drives display order; caption is optional.

-- Public bucket for portfolio images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio', 'portfolio', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Public read: anyone can view portfolio photos (public booking page).
drop policy if exists "Public can view portfolio photos" on storage.objects;
create policy "Public can view portfolio photos" on storage.objects for select
  using (bucket_id = 'portfolio');

-- Authenticated write: only shop owners/admins, path must start with a shop
-- they manage. (The API route uses the service role and enforces this too.)
drop policy if exists "Shop managers can upload portfolio photos" on storage.objects;
create policy "Shop managers can upload portfolio photos" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'portfolio'
    and public.shop_member_role(
      (string_to_array(name, '/'))[1]::uuid,
      auth.uid()
    ) in ('owner', 'admin')
  );

drop policy if exists "Shop managers can update portfolio photos" on storage.objects;
create policy "Shop managers can update portfolio photos" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'portfolio'
    and public.shop_member_role(
      (string_to_array(name, '/'))[1]::uuid,
      auth.uid()
    ) in ('owner', 'admin')
  );

drop policy if exists "Shop managers can delete portfolio photos" on storage.objects;
create policy "Shop managers can delete portfolio photos" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'portfolio'
    and public.shop_member_role(
      (string_to_array(name, '/'))[1]::uuid,
      auth.uid()
    ) in ('owner', 'admin')
  );

-- Portfolio photo records.
create table if not exists public.portfolio_photos (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  barber_id uuid references auth.users(id) on delete set null,
  photo_url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_photos_shop_id_idx
  on public.portfolio_photos(shop_id, sort_order);

alter table public.portfolio_photos enable row level security;

-- Public read: the booking page is unauthenticated.
drop policy if exists "Anyone can view portfolio photos" on public.portfolio_photos;
create policy "Anyone can view portfolio photos" on public.portfolio_photos for select
  using (true);

-- Writes: shop owners/admins only (API routes use the service role).
drop policy if exists "Shop managers can manage portfolio photos" on public.portfolio_photos;
create policy "Shop managers can manage portfolio photos" on public.portfolio_photos
  for all to authenticated
  using (
    public.shop_member_role(shop_id, auth.uid()) in ('owner', 'admin')
  )
  with check (
    public.shop_member_role(shop_id, auth.uid()) in ('owner', 'admin')
  );
