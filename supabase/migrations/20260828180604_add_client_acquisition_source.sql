ALTER TABLE clients ADD COLUMN source text CHECK (source IN ('walk_in', 'online_booking', 'referral', 'campaign', 'manual'));
ALTER TABLE appointments ADD COLUMN source text CHECK (source IN ('walk_in', 'online_booking', 'referral', 'campaign', 'manual'));

-- Backfill clients: best-guess using the one real historical signal
-- available (a matching walk_ins row by phone means they likely first
-- showed up as a walk-in), 'manual' catch-all otherwise -- there's no
-- reliable way to distinguish old online-booking clients from old
-- manually-added ones after the fact, so 'manual' is the honest default
-- rather than guessing 'online_booking' without evidence.
UPDATE clients c SET source = 'walk_in'
WHERE source IS NULL
  AND EXISTS (SELECT 1 FROM walk_ins w WHERE w.client_phone = c.phone);

UPDATE clients SET source = 'manual' WHERE source IS NULL;

-- Backfill appointments: no reliable historical signal distinguishes
-- channel after the fact (status has since moved on from what the
-- booking flow originally set), so 'manual' catch-all.
UPDATE appointments SET source = 'manual' WHERE source IS NULL;

ALTER TABLE clients ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE clients ALTER COLUMN source SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE appointments ALTER COLUMN source SET NOT NULL;

CREATE INDEX ON clients(source);
CREATE INDEX ON appointments(source);
