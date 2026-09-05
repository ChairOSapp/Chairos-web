-- Waitlist for fully-booked future appointment slots -- distinct from the
-- walk-in queue (kiosk_queue_public), which is for people physically in the
-- shop right now. A client joins this waitlist for one exact
-- shop/service/staff/date/time combination that's already taken. If that
-- exact appointment is cancelled with enough notice, the next person in
-- line gets a real-details SMS and can claim it by reply, reusing the
-- reply-to-book keyword/webhook plumbing already built for abandoned-
-- booking recovery in /api/sms/optout.

CREATE TABLE appointment_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  client_id uuid REFERENCES clients(id),
  client_name text NOT NULL,
  client_phone text NOT NULL,
  -- NULL = "any staff member" is fine for this client.
  staff_id uuid REFERENCES profiles(id),
  service_id uuid NOT NULL REFERENCES services(id),
  desired_date date NOT NULL,
  desired_time time NOT NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'notified', 'claimed', 'expired', 'cancelled')),
  -- Display-only rank within this exact slot's waiting group (computed at
  -- insert time as count-of-waiting + 1). The real tie-break used for who
  -- actually gets notified next is created_at (FIFO), since a specific-staff
  -- request and an any-staff request are two different position sequences
  -- that both compete for the same opening -- see lib/waitlistNotify.ts.
  position integer NOT NULL DEFAULT 1,
  -- Which barber's slot is currently being offered to this entry (set when
  -- status flips to 'notified', carried forward across a cascade so the
  -- next candidate is matched against the same real opening rather than
  -- re-derived from a mutable appointments row). NULL = an "any barber"
  -- appointment was the one that opened up.
  notify_barber_id uuid REFERENCES profiles(id),
  notified_at timestamptz,
  notify_expires_at timestamptz,
  claimed_appointment_id uuid REFERENCES appointments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scan target for matching a cancelled appointment against waiting entries.
CREATE INDEX appointment_waitlist_match_idx
  ON appointment_waitlist (shop_id, service_id, desired_date, desired_time)
  WHERE status = 'waiting';

-- Scan target for the inbound-reply matcher (mirrors
-- booking_sessions_phone_abandoned_idx).
CREATE INDEX appointment_waitlist_phone_notified_idx
  ON appointment_waitlist (client_phone, notified_at DESC)
  WHERE status = 'notified';

-- Scan target for the claim-window-expiry sweep.
CREATE INDEX appointment_waitlist_expiry_idx
  ON appointment_waitlist (notify_expires_at)
  WHERE status = 'notified';

CREATE INDEX appointment_waitlist_shop_idx ON appointment_waitlist (shop_id, created_at DESC);

-- Everything here writes through service-role API routes (public join) and
-- the Trigger.dev sweep (expiry cascade), never a direct anon/browser
-- insert -- same reasoning as booking_sessions. Owner/staff reads for the
-- dashboard visibility view go straight through RLS, matching the
-- reviews table's owner_manage/barber_read_own pattern.
ALTER TABLE appointment_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manage_appointment_waitlist" ON appointment_waitlist
  FOR ALL USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  ) WITH CHECK (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

CREATE POLICY "barber_read_own_appointment_waitlist" ON appointment_waitlist
  FOR SELECT USING (staff_id = auth.uid());

-- Owner-configurable cutoff: a cancellation less than this many hours
-- before the slot's start time never triggers waitlist outreach at all.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS waitlist_min_notice_hours integer NOT NULL DEFAULT 4;

-- Tag waitlist-claimed appointments distinctly from abandoned-booking
-- 'recovery' bookings so owners can tell the two automated-recovery paths
-- apart in reporting.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_source_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('walk_in', 'online_booking', 'referral', 'campaign', 'manual', 'recovery', 'portal', 'waitlist'));
