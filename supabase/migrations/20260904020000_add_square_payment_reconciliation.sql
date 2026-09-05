-- Reconciliation for Square payments an owner takes directly through their
-- own Square app/reader/dashboard, outside ChairOS's own checkout flow.
-- ChairOS's Square webhook (app/api/square/webhook/route.ts) previously
-- only acted on payments carrying a reference_id it had itself set
-- (deposit:<id> or a direct appointment id) -- any payment rung up
-- natively in Square has no such reference_id and was silently dropped.
-- This table is the fallback queue for exactly that case: a webhook-
-- matched-with-confidence payment updates the appointment directly and
-- never lands here; anything ambiguous (no unpaid-appointment match, or
-- more than one candidate) surfaces here for the owner to resolve by hand
-- in the dashboard, rather than ChairOS guessing.
CREATE TABLE unmatched_square_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES shops(id),
  square_payment_id text NOT NULL UNIQUE,
  square_location_id text,
  square_customer_id text,
  amount numeric NOT NULL,
  payment_created_at timestamptz NOT NULL,
  -- Appointment ids that matched on shop+date+amount but couldn't be
  -- narrowed to exactly one -- shown to the owner as suggestions rather
  -- than making them search from scratch.
  candidate_appointment_ids uuid[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'dismissed')),
  matched_appointment_id uuid REFERENCES appointments(id),
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX unmatched_square_payments_shop_pending_idx
  ON unmatched_square_payments (shop_id, created_at DESC) WHERE status = 'pending';

ALTER TABLE unmatched_square_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manage_unmatched_square_payments" ON unmatched_square_payments
  FOR ALL USING (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  ) WITH CHECK (
    shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid())
  );

-- Chair/booth rental billing (Task 3) -- deliberately NOT a new
-- recurring-charge-definition table. shop_barbers already models exactly
-- that: compensation_type = 'booth_rent', booth_rent_amount (weekly),
-- booth_rent_due_day. booth_rent_payments already models each period's
-- charge instance, with owner-facing manual mark-paid UI already built
-- (app/dashboard/chair/page.tsx) -- it just never had anything that (a)
-- generated periods on schedule or (b) could charge Square automatically.
-- This adds only what's missing: a card-on-file for the rent-paying
-- barber (mirrors clients.square_customer_id/square_card_id exactly) and
-- a place to record which Square payment satisfied a given period.
ALTER TABLE shop_barbers
  ADD COLUMN IF NOT EXISTS square_customer_id text,
  ADD COLUMN IF NOT EXISTS square_card_id text,
  ADD COLUMN IF NOT EXISTS square_card_brand text,
  ADD COLUMN IF NOT EXISTS square_card_last4 text;

ALTER TABLE booth_rent_payments
  ADD COLUMN IF NOT EXISTS square_payment_id text;

-- One charge attempt per barber per due date -- the scheduler's own
-- idempotency guard against a duplicate run creating two charges for the
-- same week.
CREATE UNIQUE INDEX IF NOT EXISTS booth_rent_payments_barber_due_date_idx
  ON booth_rent_payments (shop_barber_id, due_date);
