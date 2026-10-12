-- Double-booking guard (Bear directive, 2026-10-12).
--
-- Availability in the booking flow is check-then-insert with no lock,
-- and the only database constraint keyed on the exact start time — so
-- two clients booking overlapping slots for the same barber in the
-- same moment (10:00 for 30 minutes, 10:15 for 45) both passed and
-- both inserted. The calendar double-booked.
--
-- This trigger enforces the real rule at the database level: for one
-- barber at one shop on one date, appointment windows may not overlap.
-- A window includes the service's setup/cleanup buffers, matching how
-- availability treats occupied time. Cancelled appointments free
-- their slot; appointments without a barber or a service (manual
-- entries) are out of scope, as they were for availability.
--
-- A per-(shop, barber, date) advisory lock is taken first so two
-- concurrent inserts serialize their checks instead of both reading
-- a clean table and both passing — the lock is what actually closes
-- the race, the overlap check alone would not.
create or replace function public.prevent_appointment_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_new_start int;
  v_new_end int;
  v_conflict uuid;
begin
  if new.barber_id is null or new.service_id is null or new.status = 'cancelled' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.shop_id::text || ':' || new.barber_id::text || ':' || new.date::text, 0)
  );

  select
    (extract(epoch from new.time)::int / 60) - coalesce(s.buffer_before_minutes, 0),
    (extract(epoch from new.time)::int / 60) + coalesce(s.duration_minutes, 30) + coalesce(s.buffer_after_minutes, 0)
  into v_new_start, v_new_end
  from public.services s
  where s.id = new.service_id;

  if v_new_start is null then
    -- Service row not found: nothing meaningful to check against.
    return new;
  end if;

  select a.id into v_conflict
  from public.appointments a
  join public.services s on s.id = a.service_id
  where a.shop_id = new.shop_id
    and a.barber_id = new.barber_id
    and a.date = new.date
    and a.id <> new.id
    and a.status <> 'cancelled'
    and a.service_id is not null
    and (extract(epoch from a.time)::int / 60) - coalesce(s.buffer_before_minutes, 0) < v_new_end
    and v_new_start < (extract(epoch from a.time)::int / 60) + coalesce(s.duration_minutes, 30) + coalesce(s.buffer_after_minutes, 0)
  limit 1;

  if v_conflict is not null then
    raise exception 'appointment_overlap: this slot overlaps appointment %', v_conflict
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_prevent_overlap on public.appointments;
create trigger appointments_prevent_overlap
  before insert or update of date, time, barber_id, service_id, status, shop_id
  on public.appointments
  for each row execute function public.prevent_appointment_overlap();
