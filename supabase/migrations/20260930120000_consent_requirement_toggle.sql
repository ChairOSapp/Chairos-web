-- Add consent form requirement toggle per shop
-- Shops can require a signed consent form before bookings can be confirmed.
-- Defaults to true for tattoo shops (where it's legally critical), false otherwise.

alter table public.shops
  add column if not exists require_consent_form boolean not null default false;

-- Default tattoo shops to requiring consent
update public.shops
set require_consent_form = true
where vertical = 'tattoo' and require_consent_form = false;

-- Index for quick lookup
create index if not exists idx_shops_require_consent on public.shops(require_consent_form) where require_consent_form = true;
