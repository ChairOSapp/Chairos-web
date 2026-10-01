-- Trial abuse prevention: track emails that have used a free trial.
-- If someone cancels and signs up again with the same email within
-- 180 days, they don't get another free trial.

create table if not exists public.trial_history (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid,
  trial_started_at timestamptz not null default now(),
  trial_ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_trial_history_email on public.trial_history(email);

-- Only service role accesses this table. No public RLS policies.
alter table public.trial_history enable row level security;
