-- Terms of Service acceptance tracking on profiles.
-- Recorded as clickwrap acceptance at signup (app/signup/page.tsx).
-- Follows the same pattern as sms_consent / sms_consent_at.

alter table public.profiles
  add column if not exists terms_accepted boolean default false not null,
  add column if not exists terms_accepted_at timestamp with time zone;
