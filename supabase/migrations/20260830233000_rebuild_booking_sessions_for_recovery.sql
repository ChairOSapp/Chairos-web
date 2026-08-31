-- booking_sessions previously only captured name/phone/barber and nothing
-- ever wrote to it, so abandoned-booking recovery was dead on arrival.
-- This rebuilds it to actually capture what's being booked (service/date/
-- time), track the session lifecycle (in_progress -> abandoned/completed),
-- and record which recovery path (reply-to-book vs deposit link) was sent
-- and when, so the sweep job never double-sends and inbound replies can be
-- matched back to the right session.

ALTER TABLE booking_sessions
  ADD COLUMN IF NOT EXISTS shop_id uuid,
  ADD COLUMN IF NOT EXISTS service_id uuid,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS "time" time,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id),
  ADD COLUMN IF NOT EXISTS recovery_sms_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_sms_type text;

-- barber_id was text; the rest of the app (shop_barbers.barber_id,
-- appointments.barber_id) uses uuid. No rows exist yet, so this is a
-- free conversion.
ALTER TABLE booking_sessions ALTER COLUMN barber_id TYPE uuid USING NULLIF(barber_id, '')::uuid;

-- shop_name/barber_name were denormalized copies that nothing ever
-- populated; shop_id/barber_id are now the source of truth and names are
-- resolved live (via join) when composing an SMS, which is more accurate
-- than a stale copy anyway.
ALTER TABLE booking_sessions DROP COLUMN IF EXISTS shop_name;
ALTER TABLE booking_sessions DROP COLUMN IF EXISTS barber_name;

ALTER TABLE booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_status_check;
ALTER TABLE booking_sessions ALTER COLUMN status SET DEFAULT 'in_progress';
ALTER TABLE booking_sessions ADD CONSTRAINT booking_sessions_status_check
  CHECK (status IN ('in_progress', 'abandoned', 'completed'));

ALTER TABLE booking_sessions ADD CONSTRAINT booking_sessions_recovery_sms_type_check
  CHECK (recovery_sms_type IS NULL OR recovery_sms_type IN ('reply_to_book', 'deposit_link'));

-- Scan target for the sweep job: only sessions still in progress.
CREATE INDEX IF NOT EXISTS booking_sessions_in_progress_idx
  ON booking_sessions (updated_at) WHERE status = 'in_progress';

-- Scan target for the inbound-reply matcher: most recent abandoned,
-- reply-eligible session for a given phone number.
CREATE INDEX IF NOT EXISTS booking_sessions_phone_abandoned_idx
  ON booking_sessions (client_phone, recovery_sms_sent_at DESC) WHERE status = 'abandoned';

-- Everything reads/writes this table through service-role API routes and
-- the Trigger.dev sweep job, never directly from the anon/browser client,
-- so RLS stays fully locked down (unchanged from the original policy).

-- Tag recovered bookings distinctly so owners can see this feature
-- driving real bookings.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_source_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('walk_in', 'online_booking', 'referral', 'campaign', 'manual', 'recovery'));
