-- Add contact email for shops (displayed on public booking page)
alter table public.shops
  add column if not exists contact_email text;
