-- The public kiosk lobby's "Waiting List" panel was showing two-letter
-- initials only (e.g. "JD" for John Doe) -- more anonymous than intended.
-- Requested display for this public-facing panel is first name + last
-- initial (e.g. "John D."), which is what a physical waiting-room board
-- would show: recognizable to the client waiting, without exposing a
-- full last name (or anything else -- phone number was never in this
-- projection table to begin with; see the base migration's comments).
--
-- kiosk_queue_public has 0 rows at any rest (it only ever holds
-- currently-waiting/called walk-ins), so this is a clean rename+recompute
-- with nothing to backfill.

alter table kiosk_queue_public rename column initials to display_label;

drop function if exists public.compute_initials(text);

create or replace function public.compute_display_label(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name is null or trim(p_name) = '' then 'Guest'
    when split_part(trim(p_name), ' ', 2) = '' then split_part(trim(p_name), ' ', 1)
    else split_part(trim(p_name), ' ', 1) || ' ' || upper(left(split_part(trim(p_name), ' ', 2), 1)) || '.'
  end
$$;

create or replace function public.sync_kiosk_queue_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.kiosk_queue_public where id = old.id;
    return old;
  end if;

  if new.status in ('waiting', 'called') then
    insert into public.kiosk_queue_public (id, shop_id, display_label, status, created_at)
    values (new.id, new.shop_id, public.compute_display_label(new.client_name), new.status, new.created_at)
    on conflict (id) do update set status = excluded.status, display_label = excluded.display_label;
  else
    delete from public.kiosk_queue_public where id = new.id;
  end if;
  return new;
end;
$$;
