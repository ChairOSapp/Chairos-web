-- Payment method tracking: cash, Venmo, Zelle, etc. paid outside Square.
-- When an appointment is checked out, the owner/chair records HOW it was
-- paid. Cash income still counts toward earnings and the 1099 — it's just
-- categorized separately from Square-processed card payments.
-- Idempotent: safe to run multiple times.

alter table public.appointments
  add column if not exists payment_method text;

alter table public.appointments
  drop constraint if exists appointments_payment_method_check;
alter table public.appointments
  add constraint appointments_payment_method_check
  check (
    payment_method is null
    or payment_method in ('square', 'cash', 'venmo', 'zelle', 'cashapp', 'other')
  );

alter table public.clients
  add column if not exists preferred_payment_method text;

alter table public.clients
  drop constraint if exists clients_preferred_payment_method_check;
alter table public.clients
  add constraint clients_preferred_payment_method_check
  check (
    preferred_payment_method is null
    or preferred_payment_method in ('square', 'cash', 'venmo', 'zelle', 'cashapp', 'other')
  );

-- Backfill: before this feature, the only way to reach done+paid was a
-- Square charge, so legacy paid rows are card payments.
update public.appointments
set payment_method = 'square'
where payment_method is null
  and status = 'done'
  and payment_status = 'paid';
