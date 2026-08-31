-- RLS was enabled with zero policies (flagged by Supabase's advisor as
-- rls_enabled_no_policy). All app access already goes through the
-- service-role client (kiosk OTP send/verify have no authenticated user
-- context), which bypasses RLS regardless -- this makes the deny explicit
-- rather than implicit, matching the same pattern already used on
-- booking_sessions.
CREATE POLICY "service role only" ON kiosk_otp_codes USING (false);
