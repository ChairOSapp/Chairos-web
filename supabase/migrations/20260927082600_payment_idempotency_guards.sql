-- Payment idempotency guards for the public booking flow (audit follow-up).

-- 1) Per-appointment Square charge attempt counter. create-payment uses a
-- stable idempotency key per attempt (`payment-<id>`, then
-- `payment-<id>-a<N>` after clean declines) so a retry after an ambiguous
-- failure dedupes at Square, while a retry after a CLEAN decline (Square
-- answered: no charge happened) uses a fresh key. Square caches idempotent
-- responses -- including declines -- for up to 24h, so reusing the key
-- after a decline would replay the decline forever and the customer could
-- never pay with a good card.
alter table public.appointments
  add column if not exists payment_attempt integer not null default 0;

-- 2) At most one pending deposit per appointment. create-deposit reuses the
-- in-flight pending deposit on retry (same row -> same Square idempotency
-- key -> dedupe instead of a second charge); this index makes the
-- check-then-insert race impossible rather than merely unlikely.
-- NOTE: fails loudly if duplicate pending deposits already exist --
-- clean those up before applying.
create unique index if not exists deposits_one_pending_per_appointment
  on public.deposits (appointment_id)
  where status = 'pending';
