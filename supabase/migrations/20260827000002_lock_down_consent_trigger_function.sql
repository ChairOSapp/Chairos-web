-- enforce_tattoo_consent_before_confirm must stay SECURITY DEFINER: staff
-- (barbers) confirming a booking have no SELECT policy on
-- consent_form_templates (owner-only per Task 1), so as SECURITY INVOKER
-- the existence check would see zero rows through their RLS and always
-- block, even when an active template exists. Trigger firing doesn't
-- require direct EXECUTE grants — only revoke the ability to call it
-- directly via PostgREST's /rpc/ endpoint, matching this project's existing
-- convention for security-definer functions.
revoke all on function public.enforce_tattoo_consent_before_confirm() from public, anon, authenticated;
