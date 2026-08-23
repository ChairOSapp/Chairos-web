-- Preset services are seeded with no price (owner sets it after signup),
-- so price can no longer be mandatory at insert time.
alter table public.services alter column price drop not null;
