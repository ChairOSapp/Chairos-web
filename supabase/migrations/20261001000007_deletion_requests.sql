-- Deletion requests: shop owners can request full account deletion.
-- Requests are reviewed and completed within 30 days per the privacy policy.

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  requested_by uuid not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text
);

alter table public.deletion_requests enable row level security;

-- Shop owners can view their own shop's deletion requests.
create policy "deletion_requests_select_owner"
  on public.deletion_requests for select
  to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

-- Shop owners can create deletion requests for their own shops.
create policy "deletion_requests_insert_owner"
  on public.deletion_requests for insert
  to authenticated
  with check (
    shop_id in (select id from public.shops where owner_id = auth.uid())
    and requested_by = auth.uid()
  );

-- Shop owners can cancel their own pending requests.
create policy "deletion_requests_cancel_owner"
  on public.deletion_requests for update
  to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
    and status = 'pending'
  )
  with check (
    status = 'cancelled'
  );
