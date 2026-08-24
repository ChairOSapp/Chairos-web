-- Security audit remediation (2026-08-24). See commit message / audit report
-- for the full findings list. Each block below is independently safe to
-- re-run (idempotent) and is documented with the finding it closes.

-- =====================================================================
-- CRITICAL: shops.square_access_token / shop_barbers.square_access_token
-- (and sibling refresh_token/merchant_id/token_expires_at columns) were
-- readable by ANY unauthenticated caller via the "Public can view shops
-- by code" / "Public can view active shop barbers" policies (qual=true /
-- active=true, granted to role `public`), because those policies are
-- row-level and Postgres RLS cannot restrict individual columns per
-- policy. Confirmed via the app's own OAuth callback (app/api/square/
-- callback/route.ts) that live Square tokens are stored exclusively in
-- the separate `square_accounts` table (correctly scoped, not touched
-- here) and confirmed via direct query that 0 of 5 shops / 0 of 11
-- shop_barbers rows have ever had a non-null value in these columns on
-- THESE two tables. They are dead, unused duplicate columns from an
-- earlier schema iteration. Dropping them requires zero app-code changes
-- (nothing reads them) and permanently closes the leak, rather than
-- relying on a policy rewrite that a future `select('*')` could reopen.
-- =====================================================================

alter table public.shops
  drop column if exists square_access_token,
  drop column if exists square_refresh_token,
  drop column if exists square_merchant_id,
  drop column if exists square_token_expires_at;

alter table public.shop_barbers
  drop column if exists square_access_token,
  drop column if exists square_refresh_token,
  drop column if exists square_merchant_id,
  drop column if exists square_token_expires_at;

-- =====================================================================
-- HIGH: public.shop_invites had a `qual=true` public SELECT policy
-- ("Anyone can read an invite by token") leaking every pending invite
-- token/shop_id across every shop to any unauthenticated caller who
-- queries the table directly (not just via the app's own token-filtered
-- query). Confirmed zero client-side code ever reads this table (it is
-- insert-only, from app/api/invite/generate/route.ts via the service
-- role) — the public SELECT policy is entirely unused by the app and is
-- safe to drop outright.
-- =====================================================================

drop policy if exists "Anyone can read an invite by token" on public.shop_invites;

-- =====================================================================
-- HIGH: public.invites had the same class of issue ("Anyone can view
-- invite by token", qual=true) but — unlike shop_invites — IS read by
-- the app (app/join/page.tsx, looking up a specific invite by token for
-- an anonymous/just-signed-up user accepting a staff invite). Replacing
-- the raw public SELECT policy with a SECURITY DEFINER function means
-- the token match happens inside Postgres, and a caller can only ever
-- get back the single row for the token they already supplied — never
-- an unfiltered dump of every shop's pending invites.
--
-- Also adds a narrowly-scoped UPDATE policy so the invited user can
-- flip their own invite's `accepted` flag from false to true (the one
-- legitimate client-side UPDATE in the accept flow); this was actually
-- missing before (only an owner-scoped ALL policy existed), so this
-- fixes a latent functional bug alongside the security fix.
-- =====================================================================

drop policy if exists "Anyone can view invite by token" on public.invites;

create or replace function public.get_invite_by_token(p_token text)
returns table (
  invite_id uuid,
  token text,
  shop_barber_id uuid,
  shop_name text,
  shop_city text,
  barber_name text,
  barber_alias text,
  compensation_type text,
  commission_rate numeric,
  booth_rent_amount numeric
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.id, i.token, i.shop_barber_id,
    s.name, s.city,
    sb.barber_name, sb.alias, sb.compensation_type, sb.commission_rate, sb.booth_rent_amount
  from public.invites i
  join public.shops s on s.id = i.shop_id
  left join public.shop_barbers sb on sb.id = i.shop_barber_id
  where i.token = p_token
    and i.accepted = false
  limit 1;
$$;

revoke all on function public.get_invite_by_token(text) from public;
grant execute on function public.get_invite_by_token(text) to anon, authenticated;

create policy "Invited user can accept their own invite" on public.invites for update
  using (accepted = false)
  with check (accepted = true);

-- =====================================================================
-- HIGH: public.tips insert/update policies checked only `barber_id =
-- auth.uid()`, with no check that the barber is actually staff at the
-- shop_id being written. An authenticated barber at Shop A could insert
-- a fabricated tip row with an arbitrary shop_id, landing directly in
-- Shop B's tip ledger. Now requires active shop_barbers membership at
-- the target shop.
-- =====================================================================

drop policy if exists "Barbers can insert own tips" on public.tips;
create policy "Barbers can insert own tips" on public.tips for insert
  with check (
    barber_id = auth.uid()
    and shop_id in (select shop_id from public.shop_barbers where barber_id = auth.uid() and active = true)
  );

drop policy if exists "Barbers can update own tips" on public.tips;
create policy "Barbers can update own tips" on public.tips for update
  using (
    barber_id = auth.uid()
    and shop_id in (select shop_id from public.shop_barbers where barber_id = auth.uid() and active = true)
  )
  with check (
    barber_id = auth.uid()
    and shop_id in (select shop_id from public.shop_barbers where barber_id = auth.uid() and active = true)
  );

-- =====================================================================
-- MEDIUM: public.appointments "Public can insert appointments" allowed
-- ANY status/payment_status/barber_id/service_id combination from an
-- anonymous caller (with_check=true). The real public booking flow
-- (app/book/[shopCode]/page.tsx) always inserts status='pending',
-- payment_status='unpaid', and a barber_id/service_id that genuinely
-- belongs to the shop being booked — this tightens the policy to match
-- that actual shape, so an anonymous caller can no longer insert
-- appointments pre-marked paid/done or pointed at another shop's
-- barber/service. Owner-side inserts (app/dashboard/appointments/new)
-- are unaffected: they're separately authorized via the pre-existing
-- "Owners can view shop appointments" ALL policy, which has no such
-- restriction.
-- =====================================================================

drop policy if exists "Public can insert appointments" on public.appointments;
create policy "Public can insert appointments" on public.appointments for insert
  with check (
    status = 'pending'
    and payment_status = 'unpaid'
    and shop_id in (select id from public.shops)
    and (
      barber_id is null
      or barber_id in (select barber_id from public.shop_barbers where shop_id = appointments.shop_id and active = true)
    )
    and service_id in (select id from public.services where shop_id = appointments.shop_id and active = true)
  );

-- =====================================================================
-- MEDIUM: public.shop_barbers "Barbers can update their own slot" and
-- public.booth_rent_payments "Barbers can mark own payment paid" are
-- row-scoped (barber_id = auth.uid()) but have no WITH CHECK, so a
-- barber can rewrite ANY column on their own row — commission_rate,
-- tip_split_rate, booth_rent_amount, active, etc. — not just the
-- fields the app's own UI lets them touch (photo_url, on_floor).
-- Column-level GRANT/REVOKE doesn't work here because owners and
-- barbers both operate under the same `authenticated` Postgres role
-- (Supabase's browser client), so the fix is a trigger that inspects
-- WHO is making the change (auth.uid() = old.barber_id, i.e. the
-- barber editing their own row, as opposed to the owner editing a
-- staff row they manage) and blocks changes to owner-controlled
-- fields in that specific case.
-- =====================================================================

create or replace function public.protect_shop_barber_owner_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() = old.barber_id then
    if new.commission_rate is distinct from old.commission_rate
       or new.tip_split_rate is distinct from old.tip_split_rate
       or new.booth_rent_amount is distinct from old.booth_rent_amount
       or new.booth_rent_due_day is distinct from old.booth_rent_due_day
       or new.late_fee_rate is distinct from old.late_fee_rate
       or new.late_fee_interval is distinct from old.late_fee_interval
       or new.compensation_type is distinct from old.compensation_type
       or new.active is distinct from old.active
       or new.barber_name is distinct from old.barber_name
       or new.alias is distinct from old.alias
       or new.shop_id is distinct from old.shop_id
    then
      raise exception 'Only the shop owner can change compensation, status, or shop assignment fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists shop_barbers_protect_owner_fields on public.shop_barbers;
create trigger shop_barbers_protect_owner_fields
before update on public.shop_barbers
for each row execute function public.protect_shop_barber_owner_fields();

create or replace function public.protect_booth_rent_payment_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() = old.barber_id then
    if new.amount_due is distinct from old.amount_due
       or new.late_fee_amount is distinct from old.late_fee_amount
       or new.total_due is distinct from old.total_due
       or new.due_date is distinct from old.due_date
       or new.shop_id is distinct from old.shop_id
    then
      raise exception 'Only the shop owner can change rent amount or due date fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists booth_rent_payments_protect_owner_fields on public.booth_rent_payments;
create trigger booth_rent_payments_protect_owner_fields
before update on public.booth_rent_payments
for each row execute function public.protect_booth_rent_payment_fields();

-- =====================================================================
-- LOW: pin search_path on our own SECURITY DEFINER-adjacent function to
-- close the mutable-search_path advisory warning (Supabase get_advisors).
-- The other three flagged functions live in the `stripe` schema, owned
-- by the Stripe Sync Engine extension, not application code — left
-- untouched since they're none of them SECURITY DEFINER (confirmed) and
-- are managed/reset by that extension, not this migration set.
-- =====================================================================

alter function public.enforce_shop_vertical_immutable() set search_path = '';

-- =====================================================================
-- LOW: shop-assets storage bucket had no file_size_limit or
-- allowed_mime_types configured at the bucket level — only client-side
-- checks (2-5MB, accept="image/*") existed, which a direct API/curl
-- call bypasses entirely. The upload/update RLS policies on this bucket
-- were already correctly scoped by shop_id/barber_id folder (verified
-- live, just never captured in a migration file); this only adds the
-- missing size/type backstop.
-- =====================================================================

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'shop-assets';
