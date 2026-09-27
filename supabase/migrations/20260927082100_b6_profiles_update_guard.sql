-- B6: Any authenticated user could rewrite their own profiles row.
--
-- The "Users can update own profile" policy is
--   USING (id = auth.uid())   -- with NO WITH CHECK --
-- so a signed-in user could set their own role ('owner'), subscription_status
-- ('active'), plan_type, stripe_customer_id from the browser client.
--
-- Fix (additive, non-destructive -- the policy itself is left untouched): a
-- BEFORE UPDATE trigger that rejects changes to the privileged columns
-- unless the caller is service_role (server-side API routes, Stripe webhook)
-- or the security-definer accept_invite() RPC, which sets a
-- transaction-local GUC flag before its one authorized role flip.
-- Browser clients cannot set that GUC (no raw SQL through PostgREST).
--
-- Service-role detection uses the same auth.role() pattern as the existing
-- protect_client_system_fields() / shop vertical-lock triggers.
--
-- Signup/join browser writes were audited and are NOT broken by this:
--  * app/signup/page.tsx writes only sms_consent/sms_consent_at via upsert
--    (non-privileged; role at signup flows through handle_new_user, an
--    INSERT trigger, which this UPDATE trigger never sees).
--  * app/join/page.tsx's profiles.role flip moved into accept_invite()
--    (B4 migration), which sets the bypass GUC.
--  * app/dashboard/chair/settings/page.tsx updates only full_name.
--  * All server-side billing/stripe writes go through the service role.
--
-- Known adjacent gap (out of scope, left as-is): app/dashboard/staff/requests
-- page.tsx approves a pending join request with a browser-side
-- profiles.update({ role: 'barber' }) targeting ANOTHER user's row. That
-- already matches zero rows under RLS (USING id = auth.uid()) and fails
-- silently today; this trigger does not change that behavior (a zero-row
-- update never fires the trigger). It should be moved into a definer RPC
-- like accept_invite() or an owner-scoped server route.

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role'
     and current_setting('app.allow_privileged_profile_update', true) is distinct from 'on'
  then
    if new.role is distinct from old.role
       or new.subscription_status is distinct from old.subscription_status
       or new.plan_type is distinct from old.plan_type
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    then
      raise exception 'Only the service role can change privileged profile fields (role, subscription_status, plan_type, stripe_customer_id, stripe_subscription_id)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_fields on public.profiles;
create trigger profiles_protect_privileged_fields
before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();
