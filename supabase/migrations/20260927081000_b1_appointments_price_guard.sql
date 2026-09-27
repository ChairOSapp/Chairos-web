-- B1: booking price is now computed server-side.
--
-- Public bookings are created exclusively through POST /api/book/create,
-- which runs with the service-role key: it recomputes the price from
-- services.price + pricing_rules (+ a server-validated referral reward),
-- re-validates the slot in-request, and inserts with booking_key for
-- idempotency. The anonymous browser INSERT path that let anyone set an
-- arbitrary appointment price is therefore closed:
--
--   * The old "Public can insert appointments" policy (which constrained
--     status/payment_status/barber/service but NOT price) is dropped and
--     replaced with a staff-only policy below. Anonymous callers now have
--     NO insert policy on appointments at all, so anon inserts fail.
--
--   * The two remaining browser insert paths are authenticated staff and
--     keep working:
--       - owners (app/dashboard/appointments/new) via the pre-existing
--         "Owners can view shop appointments" FOR ALL policy;
--       - barbers (app/dashboard/chair walk-ins) via the new
--         "Staff can insert appointments" policy. (Note: the old public
--         policy required status='pending', so non-owner barber walk-ins
--         with status='confirmed' were actually rejected before; the new
--         policy permits 'pending'/'confirmed' for staff.)
--
--   * Service-role insert paths bypass RLS and are unaffected:
--     /api/book/create (online booking), /api/portal/rebook, and the SMS
--     reply-to-book / waitlist-claim flows in /api/sms/optout.
--
--   * No price bound is added to the staff policy on purpose: staff
--     legitimately set custom walk-in prices (chair page allows a manual
--     price that may differ from the service list price), and every
--     money-critical path (public booking, Square charge, deposit) is now
--     server-priced. The RLS change here is about *who* may insert, not
--     re-implementing pricing in SQL.
--
-- Safe on production: additive column, IF NOT EXISTS guards, no data
-- rewrites. Existing rows get booking_key = NULL (multiple NULLs are
-- allowed by the unique index).

alter table public.appointments
  add column if not exists booking_key text;

comment on column public.appointments.booking_key is
  'Idempotency key supplied by POST /api/book/create; NULL for appointments created through other flows.';

create unique index if not exists appointments_booking_key_uidx
  on public.appointments (booking_key);

drop policy if exists "Public can insert appointments" on public.appointments;

create policy "Staff can insert appointments"
  on public.appointments for insert to authenticated
  with check (
    payment_status = 'unpaid'
    and status in ('pending', 'confirmed')
    and shop_id in (
      select id from public.shops where owner_id = auth.uid()
      union
      select shop_id from public.shop_barbers where barber_id = auth.uid() and active = true
    )
    and (
      barber_id is null
      or barber_id in (
        select barber_id from public.shop_barbers
        where shop_id = appointments.shop_id and active = true
      )
    )
    and service_id in (
      select id from public.services
      where shop_id = appointments.shop_id and active = true
    )
  );
