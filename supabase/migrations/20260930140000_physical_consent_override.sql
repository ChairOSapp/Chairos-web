-- Physical consent form override per client
-- If a shop has a paper consent form on file, the owner can mark it here
-- to bypass the digital consent booking gate for that client.

alter table public.clients
  add column if not exists physical_consent_on_file boolean not null default false,
  add column if not exists physical_consent_note text,
  add column if not exists physical_consent_marked_at timestamptz,
  add column if not exists physical_consent_marked_by uuid references auth.users(id);
