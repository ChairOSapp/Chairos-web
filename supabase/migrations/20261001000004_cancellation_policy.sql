-- Add cancellation policy text to shops.
-- Shown to clients at booking time and in reminders.

alter table public.shops
  add column if not exists cancellation_policy text;
