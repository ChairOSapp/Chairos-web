-- Client notes: a dated history of staff notes per client (cut preferences,
-- color formulas, tattoo session/design notes), with optional reference
-- photos. Shared shop-wide (any active staff member can read/add), not
-- private to whoever wrote them, so a different staff member covering a
-- client has the same context.

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  author_id uuid not null,
  author_name text,
  body text not null default '',
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists client_notes_client_id_idx on public.client_notes (client_id);
create index if not exists client_notes_shop_id_idx on public.client_notes (shop_id);

alter table public.client_notes enable row level security;

-- Owners: full access (read/write/delete) to their own shop's notes
create policy "Owners can manage shop client notes" on public.client_notes for all
  using (shop_id in (select id from public.shops where owner_id = auth.uid()))
  with check (shop_id in (select id from public.shops where owner_id = auth.uid()));

-- Active staff: can view every note at their shop, not just their own
create policy "Staff can view shop client notes" on public.client_notes for select
  using (shop_id in (select shop_id from public.shop_barbers where barber_id = auth.uid() and active = true));

-- Active staff: can add notes at their shop, authored as themselves
create policy "Staff can add shop client notes" on public.client_notes for insert
  with check (
    shop_id in (select shop_id from public.shop_barbers where barber_id = auth.uid() and active = true)
    and author_id = auth.uid()
  );

-- Staff can edit or delete only the notes they personally wrote
create policy "Staff can edit own client notes" on public.client_notes for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Staff can delete own client notes" on public.client_notes for delete
  using (author_id = auth.uid());

-- Private storage bucket for reference photos (art references, color
-- formula cards, cut photos). Not public: client photos are sensitive,
-- so reads go through short-lived signed URLs, same pattern as
-- consent-signed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-notes', 'client-notes', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

-- Storage paths are namespaced {shop_id}/{note_id}/{n}.{ext}, so shop
-- scoping reuses the same owner/active-staff checks as the table itself.
create policy "Owners can upload client note photos" on storage.objects for insert
  with check (
    bucket_id = 'client-notes'
    and (storage.foldername(name))[1] in (select id::text from public.shops where owner_id = auth.uid())
  );

create policy "Staff can upload client note photos" on storage.objects for insert
  with check (
    bucket_id = 'client-notes'
    and (storage.foldername(name))[1] in (select shop_id::text from public.shop_barbers where barber_id = auth.uid() and active = true)
  );

create policy "Owners can read client note photos" on storage.objects for select
  using (
    bucket_id = 'client-notes'
    and (storage.foldername(name))[1] in (select id::text from public.shops where owner_id = auth.uid())
  );

create policy "Staff can read client note photos" on storage.objects for select
  using (
    bucket_id = 'client-notes'
    and (storage.foldername(name))[1] in (select shop_id::text from public.shop_barbers where barber_id = auth.uid() and active = true)
  );

create policy "Owners can delete client note photos" on storage.objects for delete
  using (
    bucket_id = 'client-notes'
    and (storage.foldername(name))[1] in (select id::text from public.shops where owner_id = auth.uid())
  );

create policy "Staff can delete own client note photos" on storage.objects for delete
  using (
    bucket_id = 'client-notes'
    and (storage.foldername(name))[1] in (select shop_id::text from public.shop_barbers where barber_id = auth.uid() and active = true)
  );
