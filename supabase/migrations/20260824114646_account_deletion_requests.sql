create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table account_deletion_requests enable row level security;

create policy "Users can view their own deletion requests"
  on account_deletion_requests for select
  using (auth.uid() = user_id);

create policy "Users can create their own deletion request"
  on account_deletion_requests for insert
  with check (auth.uid() = user_id);
