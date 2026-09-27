-- L1: close the NULL-barber double-booking gap left by B3.
--
-- The B3 unique index on (shop_id, barber_id, date, "time") treats NULL
-- barber_id values as distinct, so two "any barber" bookings for the same
-- shop/date/time never conflicted on it. POST /api/book/create now
-- resolves "any barber" to one specific free staff member server-side
-- (lib/server-pricing.ts: resolveAvailableBarber), which keeps barber_id
-- concrete on new rows -- but other write paths (dashboard manual
-- bookings, walk-ins, SMS rebooking) can still insert with a NULL
-- barber_id, and two concurrent NULL-barber inserts could still collide.
--
-- This trigger is the database backstop for those cases: it rejects any
-- INSERT/UPDATE that would leave two non-cancelled appointments on the
-- same (shop_id, date, "time") where either side has a NULL barber_id
-- (NULL vs NULL, or NULL vs a specific barber -- the B3 index already
-- covers specific-vs-specific). Semantics match B3: only 'cancelled'
-- stops occupying the slot.
--
-- Safe on production: additive trigger + supporting index; creates no
-- data and deletes nothing. If production already contains conflicting
-- rows the trigger only fires on NEW writes -- existing duplicates are
-- untouched (but should be cleaned up; see the B3 pre-apply check).

create or replace function public.prevent_null_barber_double_book()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Skip when nothing slot-relevant changed.
  if tg_op = 'UPDATE'
     and new.shop_id is not distinct from old.shop_id
     and new.barber_id is not distinct from old.barber_id
     and new.date is not distinct from old.date
     and new."time" is not distinct from old."time"
     and new.status is not distinct from old.status
  then
    return new;
  end if;

  -- Cancelled appointments never occupy the slot (mirrors B3).
  if new.status = 'cancelled' then
    return new;
  end if;

  if exists (
    select 1
      from public.appointments a
     where a.id is distinct from new.id
       and a.shop_id = new.shop_id
       and a.date = new.date
       and a."time" = new."time"
       and a.status <> 'cancelled'
       and (a.barber_id is null or new.barber_id is null or a.barber_id = new.barber_id)
  ) then
    raise exception 'This time slot is already booked';
  end if;

  return new;
end;
$$;

comment on function public.prevent_null_barber_double_book() is
  'BEFORE INSERT/UPDATE guard: rejects a booking when another non-cancelled '
  'appointment occupies the same (shop_id, date, time) and either side has a '
  'NULL barber_id. SECURITY DEFINER so the conflict check sees all rows '
  'regardless of the inserter''s RLS visibility. Closes the NULL-barber gap '
  'left by the B3 unique index (which cannot see NULL-vs-NULL conflicts).';

drop trigger if exists appointments_no_null_barber_double_book on public.appointments;
create trigger appointments_no_null_barber_double_book
before insert or update on public.appointments
for each row execute function public.prevent_null_barber_double_book();

-- Covering index for the trigger's conflict lookup.
create index if not exists appointments_slot_conflict_lookup_idx
  on public.appointments (shop_id, date, "time")
  where (status <> 'cancelled');
