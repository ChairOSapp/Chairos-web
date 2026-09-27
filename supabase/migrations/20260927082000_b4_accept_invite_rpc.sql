-- B4: Staff invite acceptance silently failed RLS.
--
-- The browser accept flow (app/join/page.tsx) ran
--   shop_barbers.update({ barber_id, active })  and  invites.update({ accepted: true })
-- from the client, but NO RLS policy permits those writes for the invitee:
-- "Barbers can update their own slot" needs old barber_id = auth.uid() (it is
-- NULL for an unclaimed chair) and "Owners can manage shop barbers" needs the
-- caller to be the owner. RLS matched zero rows with no error, so the flow
-- marked the invite accepted, flipped profiles.role, showed success -- and
-- never linked the chair.
--
-- This migration replaces the whole accept flow with a SECURITY DEFINER RPC
-- that validates the token, links the chair, marks the invite accepted, and
-- flips the caller's profiles.role to 'barber' atomically. The browser now
-- calls only this RPC (see app/join/page.tsx).
--
-- Schema gap fill: the spec for this RPC needs `invites.expires_at` and
-- `invites.accepted_by`, and `shop_barbers.accepted`, but none of those
-- columns exist in the baseline schema -- they are added here, all nullable
-- or defaulted so existing rows are untouched (no data-loss operations).

alter table public.invites
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_by uuid;

alter table public.shop_barbers
  add column if not exists accepted boolean not null default false;

-- =====================================================================
-- accept_invite(p_token): SECURITY DEFINER -- runs with the function
-- owner's (postgres) privileges, bypassing RLS on invites/shop_barbers/
-- profiles for exactly the writes below. Callers are authenticated users
-- who possess an invite token; the token match happens inside Postgres so
-- nothing can be enumerated.
-- =====================================================================

create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_invite record;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock the invite row: must be unaccepted and not expired.
  select i.id, i.shop_id, i.shop_barber_id
    into v_invite
    from public.invites i
   where i.token = p_token
     and i.accepted = false
     and (i.expires_at is null or i.expires_at > now())
   limit 1
   for update;

  if not found then
    raise exception 'Invite not found, already used, or expired';
  end if;

  if v_invite.shop_barber_id is null then
    raise exception 'Invite is not linked to a chair';
  end if;

  -- Link the chair: the invitee claims the placeholder shop_barbers row
  -- (barber_id is NULL until claimed). Matches zero rows if someone
  -- already claimed it.
  update public.shop_barbers
     set barber_id = v_uid,
         accepted = true,
         active = true
   where id = v_invite.shop_barber_id
     and barber_id is null;

  if not found then
    raise exception 'Invite already used';
  end if;

  -- Mark the invite accepted.
  update public.invites
     set accepted = true,
         accepted_at = now(),
         accepted_by = v_uid
   where id = v_invite.id;

  -- Flip the caller's role. The profiles guard trigger
  -- (protect_profile_privileged_fields) would reject a plain authenticated
  -- UPDATE of `role`, so the flag below is set transaction-locally to let
  -- this one definer-authorized write through. Browser clients cannot set
  -- this GUC (no raw SQL through PostgREST).
  perform set_config('app.allow_privileged_profile_update', 'on', true);

  update public.profiles
     set role = 'barber'
   where id = v_uid
     and role is distinct from 'barber';

  return jsonb_build_object(
    'shop_id', v_invite.shop_id,
    'shop_barber_id', v_invite.shop_barber_id
  );
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

comment on function public.accept_invite(text) is
  'SECURITY DEFINER: atomically accepts a staff invite token -- validates the '
  'token/expiry, links the invitee to the placeholder shop_barbers row, marks '
  'the invite accepted, and flips the invitee''s profiles.role to barber. '
  'Called by authenticated users from app/join/page.tsx; runs with definer '
  'privileges because no RLS policy permits these writes for the invitee.';

-- =====================================================================
-- M8: the over-broad "Invited user can accept their own invite" policy
-- (USING accepted=false WITH CHECK accepted=true -- no email/token
-- binding, so any authenticated user could flip ANY shop's pending invites)
-- is now dead code: the RPC above is the only accept path (verified: the
-- only client-side invites UPDATE lived in app/join/page.tsx, now removed).
-- Drop it so nothing can bypass the token-validated RPC.
-- =====================================================================

drop policy if exists "Invited user can accept their own invite" on public.invites;
