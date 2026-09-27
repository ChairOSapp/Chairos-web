-- Push notification device tokens for the ChairOS iOS app (Capacitor).
-- Tokens are APNs device tokens, keyed by the Supabase auth user (shop owners
-- and barbers). The app registers its token on launch; the server fans out
-- in-app notifications to push via lib/push.ts. APNs credentials themselves
-- live in env (APNS_TEAM_ID / APNS_KEY_ID / APNS_KEY), never in the DB.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'ios' check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

-- A signed-in user can only manage their own device tokens. Server routes
-- use the service role and bypass RLS.
drop policy if exists "Users manage own push tokens" on public.push_tokens;
create policy "Users manage own push tokens" on public.push_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
