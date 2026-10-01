-- Consent signing tokens: single-use, short-expiry tokens for the signing flow.
-- Replaces trusting bare appointment UUIDs in the Edge Function.

create table if not exists public.consent_signing_tokens (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  template_id uuid not null references public.consent_form_templates(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_consent_tokens_token on public.consent_signing_tokens(token);
create index if not exists idx_consent_tokens_appointment on public.consent_signing_tokens(appointment_id);

-- Tokens are only ever accessed via service role (API routes + Edge Function).
-- No public RLS policies — deny by default.
alter table public.consent_signing_tokens enable row level security;
