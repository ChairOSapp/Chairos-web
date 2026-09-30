-- Multi-owner/admin seats for shops.
--
-- shops.owner_id stays the PRIMARY owner (back-compat: every existing query
-- keeps working). shop_members grants additional users an 'owner' or 'admin'
-- role on a shop:
--   owner: everything the primary owner can do -- invite/remove owners and
--          admins, manage shop settings. Cannot remove the primary owner,
--          and a shop always keeps at least the primary owner.
--   admin: day-to-day management (view dashboard, manage chairs via the
--          existing invite flow). Cannot invite/remove owners or other
--          admins, cannot touch billing or delete the shop.
--
-- Seat billing (Stripe hook is TODO -- see lib/shopMembers.ts):
--   Base plan includes 1 owner seat (the primary shops.owner_id).
--   plan_tier='school' (campus package) includes 5 admin seats total.
--   Extra owner/admin seats beyond the included count are billable per seat.
--   The API flags overages; it does not block (billing lands separately).

-- Plan tier drives included seat counts. 'standard' = 1 owner seat.
-- 'school' = campus package with 5 admin seats included.
alter table public.shops
  add column if not exists plan_tier text not null default 'standard'
    check (plan_tier in ('standard', 'school'));

create table if not exists public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(shop_id, user_id)
);

create index if not exists shop_members_shop_id_idx on public.shop_members(shop_id);
create index if not exists shop_members_user_id_idx on public.shop_members(user_id);

alter table public.shop_members enable row level security;

-- Effective role of a user on a shop: 'owner' when they are the primary
-- owner (shops.owner_id), else their shop_members role, else null.
-- SECURITY DEFINER so RLS policies and client calls can use it without
-- tripping over row-level recursion (it bypasses RLS by design).
create or replace function public.shop_member_role(p_shop_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.shops s
      where s.id = p_shop_id and s.owner_id = p_user_id
    ) then 'owner'
    else (
      select m.role from public.shop_members m
      where m.shop_id = p_shop_id and m.user_id = p_user_id
      limit 1
    )
  end
$$;

-- Read: a user sees members of shops they manage (primary owner or
-- owner/admin member), plus their own membership row anywhere.
-- Writes: API routes only (service role). No client-side writes, so seat
-- limits and permission checks stay server-side.
drop policy if exists "Shop managers can read members" on public.shop_members;
create policy "Shop managers can read members" on public.shop_members for select
  using (
    auth.uid() = user_id
    or public.shop_member_role(shop_id, auth.uid()) in ('owner', 'admin')
  );
