-- L2: staff join-request approval/denial silently failed under RLS.
--
-- app/dashboard/staff/requests/page.tsx approved a request with four
-- browser-side writes:
--   shop_barbers.insert(...)            -- works (owner policy)
--   profiles.update({ role:'barber' })   -- matches ZERO rows: the "Users can
--                                          update own profile" policy is
--                                          USING (id = auth.uid()), and the
--                                          owner is updating SOMEONE ELSE's
--                                          row. Silent failure.
--   pending_barbers.update(...)          -- works (owner policy)
--   notifications.insert(...)            -- works once the chair is linked
-- The page never checked the profiles error, so approvals looked
-- successful while the new hire's role stayed NULL.
--
-- The deny path had the same class of bug: the denial notification insert
-- fails its WITH CHECK (the requester is neither an owner nor an active
-- barber yet) and its error was ignored too.
--
-- Fix: two SECURITY DEFINER RPCs that do the whole approve/deny
-- atomically after verifying the caller owns the shop. The page now calls
-- only these RPCs and surfaces real errors.
--
-- Safe on production: additive functions only; no schema or data changes.

-- =====================================================================
-- approve_join_request(p_request_id): owner-scoped, atomic approval.
-- =====================================================================

create or replace function public.approve_join_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_req record;
  v_color text;
  v_shop_barber_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock the request row: must exist and still be pending.
  select r.id, r.shop_id, r.user_id, r.name, r.status
    into v_req
    from public.pending_barbers r
   where r.id = p_request_id
   limit 1
   for update;

  if not found then
    raise exception 'Join request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Join request is no longer pending';
  end if;

  -- Owner-only: the caller must own the shop the request targets.
  if not exists (
    select 1
      from public.shops s
     where s.id = v_req.shop_id
       and s.owner_id = v_uid
  ) then
    raise exception 'Not authorized';
  end if;

  -- Defensive: never create a second active chair for the same person.
  if exists (
    select 1
      from public.shop_barbers sb
     where sb.shop_id = v_req.shop_id
       and sb.barber_id = v_req.user_id
       and sb.active = true
  ) then
    raise exception 'User is already on staff';
  end if;

  -- Same chair defaults the browser approval used (compensation, rates,
  -- random chair color from the dashboard palette).
  v_color := (array['#b8861f', '#4a7fb5', '#3aab6e', '#e07850', '#9b6db5', '#c06060'])[1 + floor(random() * 6)::int];

  insert into public.shop_barbers
    (shop_id, barber_id, barber_name, alias, active, compensation_type, commission_rate, tip_split_rate, color)
  values
    (v_req.shop_id, v_req.user_id, v_req.name, v_req.name, true, 'commission', 0.70, 1.0, v_color)
  returning id into v_shop_barber_id;

  -- Flip the new hire's role. The profiles guard trigger
  -- (protect_profile_privileged_fields) would reject a plain authenticated
  -- UPDATE of `role`, so the flag below is set transaction-locally to let
  -- this one definer-authorized write through -- same pattern as
  -- accept_invite(). Browser clients cannot set this GUC (no raw SQL
  -- through PostgREST).
  perform set_config('app.allow_privileged_profile_update', 'on', true);

  update public.profiles
     set role = 'barber'
   where id = v_req.user_id
     and role is distinct from 'barber';

  update public.pending_barbers
     set status = 'approved'
   where id = v_req.id;

  insert into public.notifications (user_id, type, message, read)
  values (v_req.user_id, 'join_approved', 'You have been approved to join the shop!', false);

  return jsonb_build_object('shop_barber_id', v_shop_barber_id, 'status', 'approved');
end;
$$;

revoke all on function public.approve_join_request(uuid) from public, anon;
grant execute on function public.approve_join_request(uuid) to authenticated;

comment on function public.approve_join_request(uuid) is
  'SECURITY DEFINER: atomically approves a staff join request -- verifies the '
  'caller owns the shop, creates the shop_barbers chair row, flips the new '
  'hire''s profiles.role to barber, marks the request approved, and notifies '
  'the user. Replaces the browser-side approval in '
  'app/dashboard/staff/requests/page.tsx, whose profiles.role update matched '
  'zero rows under RLS and failed silently.';

-- =====================================================================
-- deny_join_request(p_request_id): owner-scoped, atomic denial.
-- =====================================================================

create or replace function public.deny_join_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_req record;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select r.id, r.shop_id, r.user_id, r.status
    into v_req
    from public.pending_barbers r
   where r.id = p_request_id
   limit 1
   for update;

  if not found then
    raise exception 'Join request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Join request is no longer pending';
  end if;

  if not exists (
    select 1
      from public.shops s
     where s.id = v_req.shop_id
       and s.owner_id = v_uid
  ) then
    raise exception 'Not authorized';
  end if;

  update public.pending_barbers
     set status = 'denied'
   where id = v_req.id;

  -- Runs with definer privileges because the requester is neither an
  -- owner nor an active barber yet, so the notifications insert policy
  -- would reject this from the browser.
  insert into public.notifications (user_id, type, message, read)
  values (v_req.user_id, 'join_denied', 'Your request to join the shop was not approved.', false);

  return jsonb_build_object('status', 'denied');
end;
$$;

revoke all on function public.deny_join_request(uuid) from public, anon;
grant execute on function public.deny_join_request(uuid) to authenticated;

comment on function public.deny_join_request(uuid) is
  'SECURITY DEFINER: atomically denies a staff join request -- verifies the '
  'caller owns the shop, marks the request denied, and notifies the user. '
  'Replaces the browser-side denial in app/dashboard/staff/requests/page.tsx, '
  'whose notification insert failed its RLS WITH CHECK and was ignored.';
