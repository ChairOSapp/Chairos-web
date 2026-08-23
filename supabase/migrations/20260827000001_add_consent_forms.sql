-- Owner-uploaded consent form templates (attorney-sourced PDFs, ChairOS
-- only makes them interactive). Each upload is a new version + a new
-- storage path — files are never overwritten. Deactivating a template
-- sets is_active=false; nothing is ever deleted while signatures may
-- reference it, so there is no delete path here at all.
create table if not exists public.consent_form_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  vertical text not null,
  file_path text not null,
  version integer not null,
  is_active boolean not null default true,
  uploaded_at timestamptz not null default now(),
  unique (shop_id, version)
);

-- Fast "does this shop have an active template" lookup — the exact check
-- the confirmation-block trigger below performs on every appointment write.
create index if not exists consent_form_templates_active_idx
  on public.consent_form_templates(shop_id) where is_active = true;

alter table public.consent_form_templates enable row level security;

drop policy if exists "Owners can manage own consent templates" on public.consent_form_templates;
create policy "Owners can manage own consent templates" on public.consent_form_templates for all
  using (shop_id in (select id from public.shops where owner_id = auth.uid()));

-- Immutable signature records. Written only by the sign-consent-form edge
-- function via the service role (server-side flattening + IP capture are
-- non-negotiable, so there is no INSERT policy for anon/authenticated at
-- all — the table cannot be written to directly from the client).
-- Clients have no Supabase Auth identity in this app (they're looked up by
-- phone, not auth.uid()), so "signing client" access to their own signed
-- copy is deliberately NOT an RLS policy here — it's served through a
-- token-gated server route instead. RLS below covers the two principals
-- that *do* have a Supabase Auth identity: shop owner and shop staff.
create table if not exists public.consent_form_signatures (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  client_id uuid not null references public.clients(id),
  template_id uuid not null references public.consent_form_templates(id),
  template_version integer not null,
  signature_data jsonb not null,
  signed_pdf_path text not null,
  signed_at timestamptz not null default now(),
  ip_address text not null,
  access_token uuid not null default gen_random_uuid()
);

create index if not exists consent_form_signatures_shop_id_idx on public.consent_form_signatures(shop_id);
create index if not exists consent_form_signatures_client_id_idx on public.consent_form_signatures(client_id);
create unique index if not exists consent_form_signatures_access_token_idx on public.consent_form_signatures(access_token);

alter table public.consent_form_signatures enable row level security;

drop policy if exists "Owners can view shop consent signatures" on public.consent_form_signatures;
create policy "Owners can view shop consent signatures" on public.consent_form_signatures for select
  using (shop_id in (select id from public.shops where owner_id = auth.uid()));

drop policy if exists "Staff can view shop consent signatures" on public.consent_form_signatures;
create policy "Staff can view shop consent signatures" on public.consent_form_signatures for select
  using (shop_id in (select shop_id from public.shop_barbers where barber_id = auth.uid() and active = true));

-- TASK 3: hard block. Fires on every appointment insert/update, not just
-- specific UI entry points, so no confirmation path (owner dashboard,
-- quick-book, deposit webhook, future code) can slip past it. Checks
-- is_active specifically — a deactivated old template does not satisfy it.
create or replace function public.enforce_tattoo_consent_before_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vertical text;
  v_has_active boolean;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.status = 'confirmed' then
    return new;
  end if;

  select vertical into v_vertical from shops where id = new.shop_id;
  if v_vertical is distinct from 'tattoo' then
    return new;
  end if;

  select exists(
    select 1 from consent_form_templates
    where shop_id = new.shop_id and is_active = true
  ) into v_has_active;

  if not v_has_active then
    raise exception 'This shop requires an active tattoo consent form template before appointments can be confirmed. Upload one in Settings > Consent Forms.';
  end if;

  return new;
end;
$$;

drop trigger if exists tattoo_consent_required_before_confirm on public.appointments;
create trigger tattoo_consent_required_before_confirm
  before insert or update on public.appointments
  for each row execute function public.enforce_tattoo_consent_before_confirm();

-- Private storage buckets. Templates are owner-managed originals; signed
-- copies are written only by the edge function (service role bypasses
-- bucket RLS for that write).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consent-templates', 'consent-templates', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consent-signed', 'consent-signed', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- consent-templates: path convention {shop_id}/{version}-{uuid}.pdf
drop policy if exists "Owners can upload own consent templates" on storage.objects;
create policy "Owners can upload own consent templates" on storage.objects for insert
  with check (
    bucket_id = 'consent-templates'
    and (storage.foldername(name))[1] in (select id::text from public.shops where owner_id = auth.uid())
  );

drop policy if exists "Owners can read own consent templates" on storage.objects;
create policy "Owners can read own consent templates" on storage.objects for select
  using (
    bucket_id = 'consent-templates'
    and (storage.foldername(name))[1] in (select id::text from public.shops where owner_id = auth.uid())
  );

-- consent-signed: path convention {shop_id}/{signature_id}.pdf — owner and
-- staff can read via storage RLS; client access goes through the
-- access_token server route instead (no anon/client storage policy at all).
drop policy if exists "Owners can read own shop signed consent forms" on storage.objects;
create policy "Owners can read own shop signed consent forms" on storage.objects for select
  using (
    bucket_id = 'consent-signed'
    and (storage.foldername(name))[1] in (select id::text from public.shops where owner_id = auth.uid())
  );

drop policy if exists "Staff can read own shop signed consent forms" on storage.objects;
create policy "Staff can read own shop signed consent forms" on storage.objects for select
  using (
    bucket_id = 'consent-signed'
    and (storage.foldername(name))[1] in (select shop_id::text from public.shop_barbers where barber_id = auth.uid() and active = true)
  );
