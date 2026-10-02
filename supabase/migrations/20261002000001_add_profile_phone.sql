-- Mission Control outreach: store the account's mobile number so the founder
-- can text users from the admin dossier. Consent is tracked by the existing
-- sms_consent / sms_consent_at columns (collected at signup).
alter table public.profiles
  add column if not exists phone text;

-- Outreach log: every founder-initiated email/SMS from Mission Control.
-- Lets the dossier show what was sent, when, through which channel, and
-- whether it delivered.
create table if not exists public.admin_outreach_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sender_email text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  subject text,
  body_preview text not null,
  destination text not null,
  success boolean not null,
  provider_message_id text
);

alter table public.admin_outreach_log enable row level security;

-- Founder-only read; inserts happen server-side with the service role.
create policy "Founders read outreach log"
  on public.admin_outreach_log for select
  using (auth.jwt() ->> 'email' in ('tbbryant07@gmail.com', 'cra854@gmail.com'));

create index if not exists admin_outreach_log_user_idx
  on public.admin_outreach_log (user_id, created_at desc);
