-- B3: database-level guard against double bookings.
--
-- The in-request slot re-validation in POST /api/book/create (and the
-- rebook route) closes the check-then-insert race in the common case;
-- this unique index is the final backstop so two concurrent inserts for
-- the same chair+slot can never both commit.
--
-- Columns are date + "time" (see the appointments definition in
-- 20260101000000_baseline_schema.sql); status values are
-- pending/confirmed/done/noshow/cancelled, and only 'cancelled' stops
-- occupying the slot (mirrors NON_BLOCKING_STATUSES in
-- app/api/book/availability/route.ts).
--
-- Known limitation, kept as a documented follow-up: Postgres treats NULL
-- barber_id values as distinct, so two "any barber" (barber_id IS NULL)
-- bookings for the same shop/date/time do NOT conflict on this index.
-- Those are protected only by the in-request availability check.
--
-- Safe on production: plain CREATE UNIQUE INDEX (no CONCURRENTLY -- that
-- cannot run inside a migration transaction) with IF NOT EXISTS. It
-- creates no data and deletes nothing. If production already contains
-- duplicate non-cancelled rows for the same (shop_id, barber_id, date,
-- time), this statement will fail rather than silently dropping rows --
-- resolve the duplicates manually first, then re-run.

create unique index if not exists appointments_slot_no_double_book_idx
  on public.appointments (shop_id, barber_id, date, "time")
  where (status <> 'cancelled');
