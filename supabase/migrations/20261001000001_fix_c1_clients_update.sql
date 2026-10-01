-- SECURITY FIX C1: Drop anonymous mass-UPDATE on clients
-- The clients_update_public policy allowed anyone with the anon key to
-- UPDATE every client row platform-wide (names, phones, emails, consent flags).
-- Booking-flow client updates must go through service-role API routes.

drop policy if exists "clients_update_public" on public.clients;

-- Ensure no other overly-permissive UPDATE policies exist
-- (Owner/staff-scoped policies remain intact)
