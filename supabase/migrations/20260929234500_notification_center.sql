-- Unified notification center (Task 3 — open-source inspired: novu)
-- 2026-09-29:
-- 1. Add notifications to the supabase_realtime publication. The table was
--    missing from it, which is why the bell badge and in-page toasts only
--    updated on refresh/tab-switch — the postgres_changes subscriptions in
--    NotificationsContext never fired.
-- 2. Deep-link column so inbox rows tap through to the relevant record.
-- 3. Per-user channel preferences (push / in-app per event type) + a daily
--    digest email toggle. Stored as a jsonb map; missing keys = defaults.

alter publication supabase_realtime add table public.notifications;

alter table public.notifications
  add column if not exists link text;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- e.g. {"booking": ["push", "in_app"], "tip": ["in_app"], "brief": []}
  -- empty/missing array = off for that type; missing type = defaults.
  channels jsonb not null default '{}'::jsonb,
  digest_email boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences" on public.notification_preferences
  for all using (auth.uid() = user_id);
