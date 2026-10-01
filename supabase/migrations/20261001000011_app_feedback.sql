-- User feedback for app improvements
create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  message text not null,
  category text default 'general',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.app_feedback enable row level security;

-- Users can submit feedback
create policy "app_feedback_insert"
  on public.app_feedback for insert
  to authenticated
  with check (true);

-- Users can view their own feedback
create policy "app_feedback_select_own"
  on public.app_feedback for select
  to authenticated
  using (user_id = auth.uid());

-- Admin can view all feedback (via is_admin check on profiles)
create policy "app_feedback_select_admin"
  on public.app_feedback for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.email = 'tbbryant07@gmail.com'
    )
  );
