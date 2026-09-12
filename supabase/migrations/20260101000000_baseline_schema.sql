-- Baseline schema snapshot of production as of 2026-09-06, inserted as the
-- earliest migration so Supabase branching (and any other from-scratch
-- replay) has a complete starting point. The tracked migration history
-- before this point only contains incremental ALTERs assuming the base
-- tables already existed -- they were originally created out-of-band, not
-- via a migration file, which is what caused every branch-creation attempt
-- to fail with relation profiles does not exist.


CREATE TABLE public.account_deletion_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  role text,
  reason text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.appointment_waitlist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  client_id uuid,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  staff_id uuid,
  service_id uuid NOT NULL,
  desired_date date NOT NULL,
  desired_time time without time zone NOT NULL,
  status text DEFAULT 'waiting'::text NOT NULL,
  "position" integer DEFAULT 1 NOT NULL,
  notify_barber_id uuid,
  notified_at timestamp with time zone,
  notify_expires_at timestamp with time zone,
  claimed_appointment_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.appointments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  barber_id uuid,
  service_id uuid,
  client_id uuid,
  client_name text NOT NULL,
  client_phone text,
  client_email text,
  date date NOT NULL,
  "time" time without time zone NOT NULL,
  price numeric(10,2),
  status text DEFAULT 'pending'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  payment_status text DEFAULT 'unpaid'::text NOT NULL,
  square_payment_id text,
  amount_paid numeric(10,2),
  tip_amount numeric(10,2) DEFAULT 0 NOT NULL,
  source text DEFAULT 'manual'::text NOT NULL,
  campaign_attributed_id uuid,
  cancellation_reason text);

CREATE TABLE public.audit_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.automation_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text NOT NULL,
  payload jsonb,
  result text,
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.billing_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid,
  stripe_event_id text,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.booking_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  session_id text NOT NULL,
  client_phone text,
  client_name text,
  barber_id uuid,
  status text DEFAULT 'in_progress'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  shop_id uuid,
  service_id uuid,
  client_email text,
  date date,
  "time" time without time zone,
  appointment_id uuid,
  recovery_sms_sent_at timestamp with time zone,
  recovery_sms_type text);

CREATE TABLE public.booth_rent_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  barber_id uuid,
  shop_barber_id uuid,
  amount_due numeric(10,2) NOT NULL,
  late_fee_amount numeric(10,2) DEFAULT 0,
  total_due numeric(10,2) NOT NULL,
  due_date date NOT NULL,
  paid boolean DEFAULT false,
  paid_at timestamp with time zone,
  marked_paid_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  square_payment_id text);

CREATE TABLE public.briefs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  recipient_id uuid,
  recipient_type text,
  brief_type text,
  content jsonb,
  summary text,
  delivered_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.campaign_recipients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  campaign_id uuid,
  client_id uuid,
  phone text,
  email text,
  sms_status text DEFAULT 'pending'::text,
  email_status text DEFAULT 'pending'::text,
  sent_at timestamp with time zone,
  error text,
  created_at timestamp with time zone DEFAULT now(),
  opened_at timestamp with time zone,
  clicked_at timestamp with time zone,
  open_count integer DEFAULT 0 NOT NULL,
  click_count integer DEFAULT 0 NOT NULL,
  resend_email_id text);

CREATE TABLE public.campaign_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  campaign_id uuid,
  run_at timestamp with time zone DEFAULT now(),
  recipients_count integer,
  sent_count integer,
  failed_count integer,
  trigger_type text);

CREATE TABLE public.campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  created_by uuid,
  name text NOT NULL,
  intent text NOT NULL,
  channel text,
  audience_type text,
  audience_filters jsonb,
  sms_message text,
  email_subject text,
  email_body text,
  ai_generated boolean DEFAULT false,
  status text DEFAULT 'draft'::text,
  schedule_type text,
  scheduled_at timestamp with time zone,
  recurrence_rule text,
  recurrence_end_at timestamp with time zone,
  recurrence_count integer,
  sent_count integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now());

CREATE TABLE public.client_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  phone text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_login_at timestamp with time zone);

CREATE TABLE public.client_locks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid,
  barber_id uuid,
  shop_id uuid,
  booking_count integer DEFAULT 0,
  first_booking_date date,
  last_booking_date date,
  locked boolean DEFAULT false,
  loyalty_protected boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now());

CREATE TABLE public.client_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  author_id uuid NOT NULL,
  author_name text,
  body text DEFAULT ''::text NOT NULL,
  photo_paths text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.client_portal_otp_codes (
  phone text NOT NULL,
  code_hash text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.client_shop_memberships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.client_tags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  tag text NOT NULL,
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text,
  full_name text,
  phone text,
  preferred_barber_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  last_visit_date date,
  total_visits integer DEFAULT 0,
  sms_consent boolean DEFAULT false NOT NULL,
  sms_consent_at timestamp with time zone,
  email_consent boolean DEFAULT false NOT NULL,
  email_consent_at timestamp with time zone,
  square_customer_id text,
  square_card_id text,
  square_card_brand text,
  square_card_last4 text,
  source text DEFAULT 'manual'::text NOT NULL,
  referral_code text NOT NULL,
  referred_by_client_id uuid);

CREATE TABLE public.consent_form_signatures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  client_id uuid NOT NULL,
  template_id uuid NOT NULL,
  template_version integer NOT NULL,
  signature_data jsonb NOT NULL,
  signed_pdf_path text NOT NULL,
  signed_at timestamp with time zone DEFAULT now() NOT NULL,
  ip_address text NOT NULL,
  access_token uuid DEFAULT gen_random_uuid() NOT NULL);

CREATE TABLE public.consent_form_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  vertical text NOT NULL,
  file_path text NOT NULL,
  version integer NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  uploaded_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.deposits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  appointment_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  square_payment_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  paid_at timestamp with time zone,
  refunded_at timestamp with time zone);

CREATE TABLE public.invites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  shop_barber_id uuid,
  email text NOT NULL,
  token text NOT NULL,
  accepted boolean DEFAULT false,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.kiosk_config (
  shop_id uuid NOT NULL,
  display_mode text DEFAULT 'both'::text NOT NULL,
  primary_color text,
  accent_color text,
  logo_url text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.kiosk_otp_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  phone text NOT NULL,
  code_hash text NOT NULL,
  name text NOT NULL,
  requested_barber_id uuid,
  service_id uuid,
  attempts integer DEFAULT 0 NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.kiosk_queue_public (
  id uuid NOT NULL,
  shop_id uuid NOT NULL,
  display_label text NOT NULL,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL);

CREATE TABLE public.lapse_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  barber_id uuid,
  client_id uuid,
  client_phone text,
  client_name text,
  last_visit_at timestamp with time zone,
  lapse_type text NOT NULL,
  alerted_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  shop_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.pending_barbers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.pricing_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  service_id uuid,
  name text NOT NULL,
  promo_name text,
  days_of_week text[],
  start_time time without time zone,
  end_time time without time zone,
  start_date date,
  end_date date,
  flat_price numeric,
  percent_adjustment numeric,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  role text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text DEFAULT 'trialing'::text NOT NULL,
  subscription_end_date timestamp with time zone,
  trial_end timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
  plan_type text,
  joined_via text,
  grace_period_ends_at timestamp with time zone,
  sms_consent boolean DEFAULT false NOT NULL,
  sms_consent_at timestamp with time zone,
  email_consent boolean DEFAULT false NOT NULL,
  email_consent_at timestamp with time zone,
  trial_reminder_sent_at timestamp with time zone);

CREATE TABLE public.recommendations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  dismissed_at timestamp with time zone);

CREATE TABLE public.referral_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  event_type text NOT NULL,
  reward_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone);

CREATE TABLE public.referral_rewards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  referring_client_id uuid NOT NULL,
  referred_client_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  reward_type text NOT NULL,
  reward_value numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  earned_at timestamp with time zone,
  redeemed_at timestamp with time zone);

CREATE TABLE public.review_responses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  review_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  draft_text text NOT NULL,
  edited_text text,
  status text DEFAULT 'pending'::text NOT NULL,
  ai_generated boolean DEFAULT true NOT NULL,
  generated_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  posted_at timestamp with time zone,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now());

CREATE TABLE public.reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  barber_id uuid,
  source text,
  reviewer_name text NOT NULL,
  rating integer,
  body text,
  review_date date,
  imported_at timestamp with time zone DEFAULT now(),
  visible boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.service_presets (
  vertical text NOT NULL,
  name text NOT NULL,
  duration_minutes integer NOT NULL,
  deposit_required boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  buffer_before_minutes integer DEFAULT 0 NOT NULL,
  buffer_after_minutes integer DEFAULT 0 NOT NULL);

CREATE TABLE public.services (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  name text NOT NULL,
  price numeric(10,2),
  duration_minutes integer NOT NULL,
  description text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  deposit_required boolean DEFAULT true NOT NULL,
  buffer_before_minutes integer DEFAULT 0 NOT NULL,
  buffer_after_minutes integer DEFAULT 0 NOT NULL);

CREATE TABLE public.shop_barbers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  barber_id uuid,
  alias text,
  color text DEFAULT '#b8861f'::text,
  active boolean DEFAULT true,
  joined_at timestamp with time zone DEFAULT now(),
  compensation_type text DEFAULT 'commission'::text,
  commission_rate numeric(4,2) DEFAULT 0.70,
  tip_split_rate numeric(4,2) DEFAULT 1.0,
  booth_rent_amount numeric(10,2),
  booth_rent_due_day text,
  late_fee_rate numeric(5,4) DEFAULT 0.05,
  late_fee_interval text DEFAULT 'daily'::text,
  barber_name text,
  photo_url text,
  bio text,
  on_floor boolean DEFAULT true,
  require_card_to_book boolean,
  square_customer_id text,
  square_card_id text,
  square_card_brand text,
  square_card_last4 text);

CREATE TABLE public.shop_invites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  used boolean DEFAULT false NOT NULL,
  used_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.shop_realtime_pings (
  shop_id uuid NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.shops (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  phone text,
  hours jsonb,
  owner_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  shop_code text,
  logo_url text,
  brand_color text DEFAULT '#b8861f'::text,
  tagline text,
  hero_url text,
  bio text,
  slug text,
  barbers_collect_own_payments boolean DEFAULT false NOT NULL,
  google_place_id text,
  invite_code text,
  require_card_to_book boolean DEFAULT false NOT NULL,
  vertical text DEFAULT 'barbershop'::text NOT NULL,
  deposits_enabled boolean DEFAULT false NOT NULL,
  deposit_type text DEFAULT 'percent'::text NOT NULL,
  deposit_amount numeric DEFAULT 20 NOT NULL,
  deposit_refund_window_hours integer DEFAULT 48 NOT NULL,
  legal_business_name text,
  business_address text,
  ein text,
  meta_pixel_id text,
  google_tag_id text,
  referral_program_enabled boolean DEFAULT false NOT NULL,
  referral_reward_type text DEFAULT 'percent_off'::text NOT NULL,
  referral_reward_value numeric DEFAULT 10 NOT NULL,
  waitlist_min_notice_hours integer DEFAULT 4 NOT NULL);

CREATE TABLE public.square_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  shop_id uuid,
  square_merchant_id text NOT NULL,
  square_access_token text NOT NULL,
  square_refresh_token text,
  square_location_id text,
  connected_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.staff_tax_info (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  barber_id uuid NOT NULL,
  legal_name text,
  address text,
  tin text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.tips (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  appointment_id uuid,
  barber_id uuid,
  shop_id uuid,
  amount numeric(10,2) NOT NULL,
  cashed_out boolean DEFAULT false,
  cashed_out_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.unmatched_square_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid,
  square_payment_id text NOT NULL,
  square_location_id text,
  square_customer_id text,
  amount numeric NOT NULL,
  payment_created_at timestamp with time zone NOT NULL,
  candidate_appointment_ids uuid[] DEFAULT '{}'::uuid[],
  status text DEFAULT 'pending'::text NOT NULL,
  matched_appointment_id uuid,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  raw_payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.vertical_config (
  vertical text NOT NULL,
  staff_label text NOT NULL,
  staff_label_plural text NOT NULL,
  client_label text NOT NULL,
  lock_threshold_bookings integer NOT NULL,
  lapse_days integer NOT NULL,
  loyalty_days integer NOT NULL,
  loyalty_months_required integer NOT NULL);

CREATE TABLE public.waitlist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.walk_ins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shop_id uuid NOT NULL,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  requested_barber_id uuid,
  service_id uuid,
  status text DEFAULT 'waiting'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  called_at timestamp with time zone,
  completed_at timestamp with time zone,
  appointment_id uuid,
  client_id uuid);



ALTER TABLE ONLY public.account_deletion_requests ADD CONSTRAINT account_deletion_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_events ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.automation_logs ADD CONSTRAINT automation_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_events ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.booking_sessions ADD CONSTRAINT booking_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.booth_rent_payments ADD CONSTRAINT booth_rent_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.briefs ADD CONSTRAINT briefs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.campaign_recipients ADD CONSTRAINT campaign_recipients_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.campaign_runs ADD CONSTRAINT campaign_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_accounts ADD CONSTRAINT client_accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_locks ADD CONSTRAINT client_locks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_notes ADD CONSTRAINT client_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_portal_otp_codes ADD CONSTRAINT client_portal_otp_codes_pkey PRIMARY KEY (phone);
ALTER TABLE ONLY public.client_shop_memberships ADD CONSTRAINT client_shop_memberships_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_tags ADD CONSTRAINT client_tags_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.consent_form_signatures ADD CONSTRAINT consent_form_signatures_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.consent_form_templates ADD CONSTRAINT consent_form_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.deposits ADD CONSTRAINT deposits_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.invites ADD CONSTRAINT invites_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.kiosk_config ADD CONSTRAINT kiosk_config_pkey PRIMARY KEY (shop_id);
ALTER TABLE ONLY public.kiosk_otp_codes ADD CONSTRAINT kiosk_otp_codes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.kiosk_queue_public ADD CONSTRAINT kiosk_queue_public_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.lapse_alerts ADD CONSTRAINT lapse_alerts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pending_barbers ADD CONSTRAINT pending_barbers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pricing_rules ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recommendations ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.referral_events ADD CONSTRAINT referral_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.referral_rewards ADD CONSTRAINT referral_rewards_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.review_responses ADD CONSTRAINT review_responses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.service_presets ADD CONSTRAINT service_presets_pkey PRIMARY KEY (vertical, name);
ALTER TABLE ONLY public.services ADD CONSTRAINT services_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shop_barbers ADD CONSTRAINT shop_barbers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shop_invites ADD CONSTRAINT shop_invites_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shop_realtime_pings ADD CONSTRAINT shop_realtime_pings_pkey PRIMARY KEY (shop_id);
ALTER TABLE ONLY public.shops ADD CONSTRAINT shops_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.square_accounts ADD CONSTRAINT square_accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.staff_tax_info ADD CONSTRAINT staff_tax_info_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tips ADD CONSTRAINT tips_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.unmatched_square_payments ADD CONSTRAINT unmatched_square_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vertical_config ADD CONSTRAINT vertical_config_pkey PRIMARY KEY (vertical);
ALTER TABLE ONLY public.waitlist ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.walk_ins ADD CONSTRAINT walk_ins_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_events ADD CONSTRAINT billing_events_stripe_event_id_key UNIQUE (stripe_event_id);
ALTER TABLE ONLY public.booking_sessions ADD CONSTRAINT booking_sessions_session_id_key UNIQUE (session_id);
ALTER TABLE ONLY public.client_accounts ADD CONSTRAINT client_accounts_phone_key UNIQUE (phone);
ALTER TABLE ONLY public.client_locks ADD CONSTRAINT client_locks_client_id_barber_id_shop_id_key UNIQUE (client_id, barber_id, shop_id);
ALTER TABLE ONLY public.client_shop_memberships ADD CONSTRAINT client_shop_memberships_client_id_shop_id_key UNIQUE (client_id, shop_id);
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_email_key UNIQUE (email);
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_phone_key UNIQUE (phone);
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_referral_code_unique UNIQUE (referral_code);
ALTER TABLE ONLY public.consent_form_templates ADD CONSTRAINT consent_form_templates_shop_id_version_key UNIQUE (shop_id, version);
ALTER TABLE ONLY public.invites ADD CONSTRAINT invites_token_key UNIQUE (token);
ALTER TABLE ONLY public.kiosk_otp_codes ADD CONSTRAINT kiosk_otp_codes_shop_id_phone_key UNIQUE (shop_id, phone);
ALTER TABLE ONLY public.pending_barbers ADD CONSTRAINT pending_barbers_shop_id_user_id_key UNIQUE (shop_id, user_id);
ALTER TABLE ONLY public.review_responses ADD CONSTRAINT review_responses_review_id_key UNIQUE (review_id);
ALTER TABLE ONLY public.shops ADD CONSTRAINT shops_shop_code_key UNIQUE (shop_code);
ALTER TABLE ONLY public.shops ADD CONSTRAINT shops_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.staff_tax_info ADD CONSTRAINT staff_tax_info_barber_id_key UNIQUE (barber_id);
ALTER TABLE ONLY public.unmatched_square_payments ADD CONSTRAINT unmatched_square_payments_square_payment_id_key UNIQUE (square_payment_id);
ALTER TABLE ONLY public.waitlist ADD CONSTRAINT waitlist_email_key UNIQUE (email);
ALTER TABLE ONLY public.account_deletion_requests ADD CONSTRAINT account_deletion_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_claimed_appointment_id_fkey FOREIGN KEY (claimed_appointment_id) REFERENCES appointments(id);
ALTER TABLE ONLY public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE ONLY public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_notify_barber_id_fkey FOREIGN KEY (notify_barber_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE ONLY public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE ONLY public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_campaign_attributed_id_fkey FOREIGN KEY (campaign_attributed_id) REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.audit_events ADD CONSTRAINT audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.audit_events ADD CONSTRAINT audit_events_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.billing_events ADD CONSTRAINT billing_events_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.booking_sessions ADD CONSTRAINT booking_sessions_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE ONLY public.booth_rent_payments ADD CONSTRAINT booth_rent_payments_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.booth_rent_payments ADD CONSTRAINT booth_rent_payments_marked_paid_by_fkey FOREIGN KEY (marked_paid_by) REFERENCES profiles(id);
ALTER TABLE ONLY public.booth_rent_payments ADD CONSTRAINT booth_rent_payments_shop_barber_id_fkey FOREIGN KEY (shop_barber_id) REFERENCES shop_barbers(id);
ALTER TABLE ONLY public.booth_rent_payments ADD CONSTRAINT booth_rent_payments_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.briefs ADD CONSTRAINT briefs_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.briefs ADD CONSTRAINT briefs_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE ONLY public.campaign_recipients ADD CONSTRAINT campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.campaign_recipients ADD CONSTRAINT campaign_recipients_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE ONLY public.campaign_runs ADD CONSTRAINT campaign_runs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_locks ADD CONSTRAINT client_locks_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_locks ADD CONSTRAINT client_locks_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_locks ADD CONSTRAINT client_locks_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_notes ADD CONSTRAINT client_notes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_notes ADD CONSTRAINT client_notes_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_shop_memberships ADD CONSTRAINT client_shop_memberships_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_shop_memberships ADD CONSTRAINT client_shop_memberships_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_tags ADD CONSTRAINT client_tags_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_tags ADD CONSTRAINT client_tags_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_preferred_barber_id_fkey FOREIGN KEY (preferred_barber_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_referred_by_client_id_fkey FOREIGN KEY (referred_by_client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.consent_form_signatures ADD CONSTRAINT consent_form_signatures_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE ONLY public.consent_form_signatures ADD CONSTRAINT consent_form_signatures_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE ONLY public.consent_form_signatures ADD CONSTRAINT consent_form_signatures_template_id_fkey FOREIGN KEY (template_id) REFERENCES consent_form_templates(id);
ALTER TABLE ONLY public.consent_form_templates ADD CONSTRAINT consent_form_templates_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE ONLY public.deposits ADD CONSTRAINT deposits_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE ONLY public.deposits ADD CONSTRAINT deposits_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE ONLY public.invites ADD CONSTRAINT invites_shop_barber_id_fkey FOREIGN KEY (shop_barber_id) REFERENCES shop_barbers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invites ADD CONSTRAINT invites_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.kiosk_config ADD CONSTRAINT kiosk_config_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.kiosk_otp_codes ADD CONSTRAINT kiosk_otp_codes_requested_barber_id_fkey FOREIGN KEY (requested_barber_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.kiosk_otp_codes ADD CONSTRAINT kiosk_otp_codes_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE ONLY public.kiosk_otp_codes ADD CONSTRAINT kiosk_otp_codes_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.kiosk_queue_public ADD CONSTRAINT kiosk_queue_public_id_fkey FOREIGN KEY (id) REFERENCES walk_ins(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.kiosk_queue_public ADD CONSTRAINT kiosk_queue_public_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.lapse_alerts ADD CONSTRAINT lapse_alerts_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.lapse_alerts ADD CONSTRAINT lapse_alerts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.lapse_alerts ADD CONSTRAINT lapse_alerts_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pending_barbers ADD CONSTRAINT pending_barbers_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pending_barbers ADD CONSTRAINT pending_barbers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pricing_rules ADD CONSTRAINT pricing_rules_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pricing_rules ADD CONSTRAINT pricing_rules_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);
ALTER TABLE ONLY public.recommendations ADD CONSTRAINT recommendations_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referral_events ADD CONSTRAINT referral_events_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referral_events ADD CONSTRAINT referral_events_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES referral_rewards(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referral_events ADD CONSTRAINT referral_events_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referral_rewards ADD CONSTRAINT referral_rewards_referred_client_id_fkey FOREIGN KEY (referred_client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referral_rewards ADD CONSTRAINT referral_rewards_referring_client_id_fkey FOREIGN KEY (referring_client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referral_rewards ADD CONSTRAINT referral_rewards_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.review_responses ADD CONSTRAINT review_responses_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.review_responses ADD CONSTRAINT review_responses_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.service_presets ADD CONSTRAINT service_presets_vertical_fkey FOREIGN KEY (vertical) REFERENCES vertical_config(vertical);
ALTER TABLE ONLY public.services ADD CONSTRAINT services_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shop_barbers ADD CONSTRAINT shop_barbers_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shop_barbers ADD CONSTRAINT shop_barbers_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shop_invites ADD CONSTRAINT shop_invites_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shop_invites ADD CONSTRAINT shop_invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES profiles(id);
ALTER TABLE ONLY public.shop_realtime_pings ADD CONSTRAINT shop_realtime_pings_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shops ADD CONSTRAINT shops_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);
ALTER TABLE ONLY public.square_accounts ADD CONSTRAINT square_accounts_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.square_accounts ADD CONSTRAINT square_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.staff_tax_info ADD CONSTRAINT staff_tax_info_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tips ADD CONSTRAINT tips_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tips ADD CONSTRAINT tips_barber_id_fkey FOREIGN KEY (barber_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.tips ADD CONSTRAINT tips_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE ONLY public.unmatched_square_payments ADD CONSTRAINT unmatched_square_payments_matched_appointment_id_fkey FOREIGN KEY (matched_appointment_id) REFERENCES appointments(id);
ALTER TABLE ONLY public.unmatched_square_payments ADD CONSTRAINT unmatched_square_payments_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES profiles(id);
ALTER TABLE ONLY public.unmatched_square_payments ADD CONSTRAINT unmatched_square_payments_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id);
ALTER TABLE ONLY public.walk_ins ADD CONSTRAINT walk_ins_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.walk_ins ADD CONSTRAINT walk_ins_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.walk_ins ADD CONSTRAINT walk_ins_requested_barber_id_fkey FOREIGN KEY (requested_barber_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.walk_ins ADD CONSTRAINT walk_ins_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE ONLY public.walk_ins ADD CONSTRAINT walk_ins_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.appointment_waitlist ADD CONSTRAINT appointment_waitlist_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'notified'::text, 'claimed'::text, 'expired'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_source_check CHECK ((source = ANY (ARRAY['walk_in'::text, 'online_booking'::text, 'referral'::text, 'campaign'::text, 'manual'::text, 'recovery'::text, 'portal'::text, 'waitlist'::text])));
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'done'::text, 'noshow'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.booking_sessions ADD CONSTRAINT booking_sessions_recovery_sms_type_check CHECK (((recovery_sms_type IS NULL) OR (recovery_sms_type = ANY (ARRAY['reply_to_book'::text, 'deposit_link'::text]))));
ALTER TABLE ONLY public.booking_sessions ADD CONSTRAINT booking_sessions_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'abandoned'::text, 'completed'::text])));
ALTER TABLE ONLY public.briefs ADD CONSTRAINT briefs_brief_type_check CHECK ((brief_type = ANY (ARRAY['daily'::text, 'weekly'::text])));
ALTER TABLE ONLY public.briefs ADD CONSTRAINT briefs_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['owner'::text, 'barber'::text])));
ALTER TABLE ONLY public.campaign_runs ADD CONSTRAINT campaign_runs_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'scheduled'::text, 'recurring'::text])));
ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_audience_type_check CHECK ((audience_type = ANY (ARRAY['all_clients'::text, 'lapsed_clients'::text, 'specific_barber'::text, 'specific_service'::text, 'no_booking_since'::text, 'manual_list'::text])));
ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_channel_check CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text, 'both'::text])));
ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_schedule_type_check CHECK ((schedule_type = ANY (ARRAY['now'::text, 'once'::text, 'recurring'::text])));
ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_source_check CHECK ((source = ANY (ARRAY['walk_in'::text, 'online_booking'::text, 'referral'::text, 'campaign'::text, 'manual'::text])));
ALTER TABLE ONLY public.deposits ADD CONSTRAINT deposits_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text, 'expired'::text])));
ALTER TABLE ONLY public.deposits ADD CONSTRAINT deposits_type_check CHECK ((type = ANY (ARRAY['flat'::text, 'percent'::text])));
ALTER TABLE ONLY public.kiosk_config ADD CONSTRAINT kiosk_config_display_mode_check CHECK ((display_mode = ANY (ARRAY['off'::text, 'queue'::text, 'slots'::text, 'both'::text])));
ALTER TABLE ONLY public.kiosk_queue_public ADD CONSTRAINT kiosk_queue_public_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'called'::text])));
ALTER TABLE ONLY public.lapse_alerts ADD CONSTRAINT lapse_alerts_lapse_type_check CHECK ((lapse_type = ANY (ARRAY['standard'::text, 'loyalty'::text])));
ALTER TABLE ONLY public.pending_barbers ADD CONSTRAINT pending_barbers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text])));
ALTER TABLE ONLY public.pricing_rules ADD CONSTRAINT pricing_rules_date_order CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (start_date <= end_date)));
ALTER TABLE ONLY public.pricing_rules ADD CONSTRAINT pricing_rules_date_range CHECK (((start_date IS NULL) = (end_date IS NULL)));
ALTER TABLE ONLY public.pricing_rules ADD CONSTRAINT pricing_rules_one_adjustment CHECK ((num_nonnulls(flat_price, percent_adjustment) = 1));
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_joined_via_check CHECK ((joined_via = ANY (ARRAY['invite_link'::text, 'shop_code'::text, 'solo'::text])));
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_plan_type_check CHECK ((plan_type = ANY (ARRAY['shop'::text, 'solo'::text])));
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'barber'::text])));
ALTER TABLE ONLY public.recommendations ADD CONSTRAINT recommendations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'dismissed'::text])));
ALTER TABLE ONLY public.recommendations ADD CONSTRAINT recommendations_type_check CHECK ((type = ANY (ARRAY['underbooked_service'::text, 'staffing_imbalance'::text, 'pricing_signal'::text])));
ALTER TABLE ONLY public.referral_events ADD CONSTRAINT referral_events_event_type_check CHECK ((event_type = ANY (ARRAY['first_visit'::text, 'referral_earned'::text])));
ALTER TABLE ONLY public.referral_rewards ADD CONSTRAINT referral_rewards_reward_type_check CHECK ((reward_type = ANY (ARRAY['percent_off'::text, 'flat_credit'::text])));
ALTER TABLE ONLY public.referral_rewards ADD CONSTRAINT referral_rewards_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'earned'::text, 'redeemed'::text])));
ALTER TABLE ONLY public.review_responses ADD CONSTRAINT review_responses_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'posted'::text, 'dismissed'::text])));
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_source_check CHECK ((source = ANY (ARRAY['google'::text, 'booksy'::text, 'manual'::text, 'chairos'::text])));
ALTER TABLE ONLY public.shop_barbers ADD CONSTRAINT shop_barbers_booth_rent_due_day_check CHECK ((booth_rent_due_day = ANY (ARRAY['monday'::text, 'tuesday'::text, 'wednesday'::text, 'thursday'::text, 'friday'::text, 'saturday'::text, 'sunday'::text])));
ALTER TABLE ONLY public.shop_barbers ADD CONSTRAINT shop_barbers_compensation_type_check CHECK ((compensation_type = ANY (ARRAY['commission'::text, 'booth_rent'::text])));
ALTER TABLE ONLY public.shop_barbers ADD CONSTRAINT shop_barbers_late_fee_interval_check CHECK ((late_fee_interval = ANY (ARRAY['daily'::text, 'weekly'::text])));
ALTER TABLE ONLY public.shops ADD CONSTRAINT shops_deposit_type_check CHECK ((deposit_type = ANY (ARRAY['flat'::text, 'percent'::text])));
ALTER TABLE ONLY public.shops ADD CONSTRAINT shops_referral_reward_type_check CHECK ((referral_reward_type = ANY (ARRAY['percent_off'::text, 'flat_credit'::text])));
ALTER TABLE ONLY public.shops ADD CONSTRAINT shops_vertical_check CHECK ((vertical = ANY (ARRAY['barbershop'::text, 'salon'::text, 'tattoo'::text])));
ALTER TABLE ONLY public.unmatched_square_payments ADD CONSTRAINT unmatched_square_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'matched'::text, 'dismissed'::text])));
ALTER TABLE ONLY public.vertical_config ADD CONSTRAINT vertical_config_vertical_check CHECK ((vertical = ANY (ARRAY['barbershop'::text, 'salon'::text, 'tattoo'::text])));
ALTER TABLE ONLY public.walk_ins ADD CONSTRAINT walk_ins_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'called'::text, 'in_service'::text, 'done'::text, 'cancelled'::text])));



CREATE INDEX appointment_waitlist_expiry_idx ON public.appointment_waitlist USING btree (notify_expires_at) WHERE (status = 'notified'::text);
CREATE INDEX appointment_waitlist_match_idx ON public.appointment_waitlist USING btree (shop_id, service_id, desired_date, desired_time) WHERE (status = 'waiting'::text);
CREATE INDEX appointment_waitlist_phone_notified_idx ON public.appointment_waitlist USING btree (client_phone, notified_at DESC) WHERE (status = 'notified'::text);
CREATE INDEX appointment_waitlist_shop_idx ON public.appointment_waitlist USING btree (shop_id, created_at DESC);
CREATE INDEX appointments_barber_date_time_idx ON public.appointments USING btree (barber_id, date, "time");
CREATE INDEX appointments_campaign_attributed_id_idx ON public.appointments USING btree (campaign_attributed_id);
CREATE INDEX appointments_client_id_idx ON public.appointments USING btree (client_id);
CREATE INDEX appointments_service_id_idx ON public.appointments USING btree (service_id);
CREATE INDEX appointments_shop_date_time_idx ON public.appointments USING btree (shop_id, date, "time");
CREATE INDEX appointments_source_idx ON public.appointments USING btree (source);
CREATE INDEX appointments_status_date_idx ON public.appointments USING btree (status, date);
CREATE INDEX audit_events_shop_created_idx ON public.audit_events USING btree (shop_id, created_at DESC);
CREATE INDEX automation_logs_type_created ON public.automation_logs USING btree (type, created_at DESC);
CREATE INDEX billing_events_profile_id_idx ON public.billing_events USING btree (profile_id);
CREATE INDEX billing_events_stripe_event_id_idx ON public.billing_events USING btree (stripe_event_id);
CREATE INDEX booking_sessions_in_progress_idx ON public.booking_sessions USING btree (updated_at) WHERE (status = 'in_progress'::text);
CREATE INDEX booking_sessions_phone_abandoned_idx ON public.booking_sessions USING btree (client_phone, recovery_sms_sent_at DESC) WHERE (status = 'abandoned'::text);
CREATE UNIQUE INDEX booth_rent_payments_barber_due_date_idx ON public.booth_rent_payments USING btree (shop_barber_id, due_date);
CREATE INDEX briefs_delivered_at_idx ON public.briefs USING btree (delivered_at);
CREATE INDEX briefs_recipient_id_idx ON public.briefs USING btree (recipient_id);
CREATE INDEX briefs_shop_id_idx ON public.briefs USING btree (shop_id);
CREATE INDEX campaign_recipients_resend_email_id_idx ON public.campaign_recipients USING btree (resend_email_id);
CREATE INDEX client_notes_client_id_idx ON public.client_notes USING btree (client_id);
CREATE INDEX client_notes_shop_id_idx ON public.client_notes USING btree (shop_id);
CREATE INDEX client_shop_memberships_shop_client_idx ON public.client_shop_memberships USING btree (shop_id, client_id);
CREATE INDEX client_tags_client_id_idx ON public.client_tags USING btree (client_id);
CREATE UNIQUE INDEX client_tags_client_id_shop_id_tag_idx ON public.client_tags USING btree (client_id, shop_id, tag);
CREATE INDEX client_tags_shop_id_idx ON public.client_tags USING btree (shop_id);
CREATE INDEX clients_source_idx ON public.clients USING btree (source);
CREATE UNIQUE INDEX consent_form_signatures_access_token_idx ON public.consent_form_signatures USING btree (access_token);
CREATE INDEX consent_form_signatures_client_id_idx ON public.consent_form_signatures USING btree (client_id);
CREATE INDEX consent_form_signatures_shop_id_idx ON public.consent_form_signatures USING btree (shop_id);
CREATE INDEX consent_form_templates_active_idx ON public.consent_form_templates USING btree (shop_id) WHERE (is_active = true);
CREATE INDEX deposits_appointment_id_idx ON public.deposits USING btree (appointment_id);
CREATE INDEX deposits_pending_expiry_idx ON public.deposits USING btree (expires_at) WHERE (status = 'pending'::text);
CREATE INDEX deposits_shop_id_idx ON public.deposits USING btree (shop_id);
CREATE INDEX kiosk_queue_public_shop_id_idx ON public.kiosk_queue_public USING btree (shop_id);
CREATE INDEX lapse_alerts_shop_client_unresolved ON public.lapse_alerts USING btree (shop_id, client_phone) WHERE (resolved_at IS NULL);
CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at DESC);
CREATE INDEX notifications_read_idx ON public.notifications USING btree (user_id, read);
CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id);
CREATE INDEX pricing_rules_service_id_idx ON public.pricing_rules USING btree (service_id);
CREATE INDEX pricing_rules_shop_id_idx ON public.pricing_rules USING btree (shop_id);
CREATE INDEX profiles_stripe_customer_id_idx ON public.profiles USING btree (stripe_customer_id);
CREATE INDEX recommendations_shop_id_status_idx ON public.recommendations USING btree (shop_id, status);
CREATE INDEX referral_events_unprocessed_idx ON public.referral_events USING btree (processed_at) WHERE (processed_at IS NULL);
CREATE INDEX referral_rewards_referring_client_idx ON public.referral_rewards USING btree (referring_client_id, status);
CREATE INDEX referral_rewards_shop_status_idx ON public.referral_rewards USING btree (shop_id, status);
CREATE INDEX review_responses_shop_id_idx ON public.review_responses USING btree (shop_id);
CREATE INDEX reviews_barber_id_idx ON public.reviews USING btree (barber_id);
CREATE UNIQUE INDEX reviews_google_dedup ON public.reviews USING btree (shop_id, reviewer_name, review_date) WHERE (source = 'google'::text);
CREATE INDEX reviews_shop_id_idx ON public.reviews USING btree (shop_id);
CREATE UNIQUE INDEX reviews_shop_reviewer_date_idx ON public.reviews USING btree (shop_id, reviewer_name, review_date);
CREATE INDEX shop_invites_shop_id_idx ON public.shop_invites USING btree (shop_id);
CREATE INDEX shop_invites_token_idx ON public.shop_invites USING btree (token);
CREATE UNIQUE INDEX square_accounts_user_id_key ON public.square_accounts USING btree (user_id);
CREATE INDEX unmatched_square_payments_shop_pending_idx ON public.unmatched_square_payments USING btree (shop_id, created_at DESC) WHERE (status = 'pending'::text);
CREATE INDEX walk_ins_appointment_id_idx ON public.walk_ins USING btree (appointment_id);
CREATE INDEX walk_ins_client_id_idx ON public.walk_ins USING btree (client_id);
CREATE INDEX walk_ins_requested_barber_id_idx ON public.walk_ins USING btree (requested_barber_id);
CREATE INDEX walk_ins_service_id_idx ON public.walk_ins USING btree (service_id);
CREATE INDEX walk_ins_shop_status_idx ON public.walk_ins USING btree (shop_id, status, created_at);



ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booth_rent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_shop_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_form_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_queue_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lapse_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_realtime_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.square_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_tax_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unmatched_square_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vertical_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.walk_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create their own deletion request" ON public.account_deletion_requests FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view their own deletion requests" ON public.account_deletion_requests FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY barber_read_own_appointment_waitlist ON public.appointment_waitlist FOR SELECT TO public USING ((staff_id = auth.uid()));
CREATE POLICY owner_manage_appointment_waitlist ON public.appointment_waitlist FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid())))) WITH CHECK ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Barbers can update own appointments" ON public.appointments FOR UPDATE TO public USING ((barber_id = auth.uid()));
CREATE POLICY "Barbers can view own appointments" ON public.appointments FOR SELECT TO public USING ((barber_id = auth.uid()));
CREATE POLICY "Owners can update shop appointments" ON public.appointments FOR UPDATE TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Owners can view shop appointments" ON public.appointments FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Public can insert appointments" ON public.appointments FOR INSERT TO public WITH CHECK (((status = 'pending'::text) AND (payment_status = 'unpaid'::text) AND (shop_id IN ( SELECT shops.id FROM shops)) AND ((barber_id IS NULL) OR (barber_id IN ( SELECT shop_barbers.barber_id FROM shop_barbers WHERE ((shop_barbers.shop_id = appointments.shop_id) AND (shop_barbers.active = true))))) AND (service_id IN ( SELECT services.id FROM services WHERE ((services.shop_id = appointments.shop_id) AND (services.active = true))))));
CREATE POLICY audit_events_select_owner ON public.audit_events FOR SELECT TO authenticated USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "service role only" ON public.automation_logs FOR ALL TO public USING (false);
CREATE POLICY "Users can view their own billing events" ON public.billing_events FOR SELECT TO authenticated USING ((profile_id = auth.uid()));
CREATE POLICY "service role only" ON public.booking_sessions FOR ALL TO public USING (false);
CREATE POLICY "Barbers can mark own payment paid" ON public.booth_rent_payments FOR UPDATE TO public USING ((barber_id = auth.uid()));
CREATE POLICY "Barbers can view own booth rent payments" ON public.booth_rent_payments FOR SELECT TO public USING ((barber_id = auth.uid()));
CREATE POLICY "Owners can manage booth rent payments" ON public.booth_rent_payments FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Barbers can read their own briefs" ON public.briefs FOR SELECT TO public USING ((recipient_id = auth.uid()));
CREATE POLICY "Owners can read their shop briefs" ON public.briefs FOR SELECT TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Recipients can update own briefs" ON public.briefs FOR UPDATE TO public USING ((recipient_id = auth.uid()));
CREATE POLICY "Owners manage campaign recipients" ON public.campaign_recipients FOR ALL TO public USING ((campaign_id IN ( SELECT c.id FROM (campaigns c JOIN shops s ON ((s.id = c.shop_id))) WHERE (s.owner_id = auth.uid()))));
CREATE POLICY "Owners manage campaign runs" ON public.campaign_runs FOR ALL TO public USING ((campaign_id IN ( SELECT c.id FROM (campaigns c JOIN shops s ON ((s.id = c.shop_id))) WHERE (s.owner_id = auth.uid()))));
CREATE POLICY "Owners manage their campaigns" ON public.campaigns FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "service role only" ON public.client_accounts FOR ALL TO public USING (false);
CREATE POLICY "Barbers can view own client locks" ON public.client_locks FOR SELECT TO public USING ((barber_id = auth.uid()));
CREATE POLICY "Owners can update client locks" ON public.client_locks FOR UPDATE TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Owners can view shop client locks" ON public.client_locks FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Owners can manage shop client notes" ON public.client_notes FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid())))) WITH CHECK ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Staff can add shop client notes" ON public.client_notes FOR INSERT TO public WITH CHECK (((shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true)))) AND (author_id = auth.uid())));
CREATE POLICY "Staff can delete own client notes" ON public.client_notes FOR DELETE TO public USING ((author_id = auth.uid()));
CREATE POLICY "Staff can edit own client notes" ON public.client_notes FOR UPDATE TO public USING ((author_id = auth.uid())) WITH CHECK ((author_id = auth.uid()));
CREATE POLICY "Staff can view shop client notes" ON public.client_notes FOR SELECT TO public USING ((shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true)))));
CREATE POLICY "service role only" ON public.client_portal_otp_codes FOR ALL TO public USING (false);
CREATE POLICY "Barbers can view their shop client memberships" ON public.client_shop_memberships FOR SELECT TO public USING ((shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE (shop_barbers.barber_id = auth.uid()))));
CREATE POLICY "Owners can view their shop client memberships" ON public.client_shop_memberships FOR SELECT TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY owner_manage_client_tags ON public.client_tags FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid())))) WITH CHECK ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY staff_insert_client_tags ON public.client_tags FOR INSERT TO public WITH CHECK ((shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true)))));
CREATE POLICY staff_read_client_tags ON public.client_tags FOR SELECT TO public USING ((shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true)))));
CREATE POLICY "Users can view clients in their shop" ON public.clients FOR SELECT TO public USING ((id IN ( SELECT client_shop_memberships.client_id FROM client_shop_memberships WHERE (client_shop_memberships.shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()) UNION SELECT shop_barbers.shop_id FROM shop_barbers WHERE (shop_barbers.barber_id = auth.uid()))))));
CREATE POLICY clients_insert_public ON public.clients FOR INSERT TO public WITH CHECK (true);
CREATE POLICY clients_update_public ON public.clients FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Owners can view shop consent signatures" ON public.consent_form_signatures FOR SELECT TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Staff can view shop consent signatures" ON public.consent_form_signatures FOR SELECT TO public USING ((shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true)))));
CREATE POLICY "Owners can manage own consent templates" ON public.consent_form_templates FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Owners can manage shop deposits" ON public.deposits FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Invited user can accept their own invite" ON public.invites FOR UPDATE TO public USING ((accepted = false)) WITH CHECK ((accepted = true));
CREATE POLICY "Owners can manage invites" ON public.invites FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Owners can manage kiosk config" ON public.kiosk_config FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid())))) WITH CHECK ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Public can view kiosk config" ON public.kiosk_config FOR SELECT TO public USING (true);
CREATE POLICY "service role only" ON public.kiosk_otp_codes FOR ALL TO public USING (false);
CREATE POLICY "Public can view kiosk queue" ON public.kiosk_queue_public FOR SELECT TO public USING (true);
CREATE POLICY "service role only" ON public.lapse_alerts FOR ALL TO public USING (false);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY notifications_insert_shop_relationship ON public.notifications FOR INSERT TO public WITH CHECK (((user_id IN ( SELECT shops.owner_id FROM shops)) OR (user_id IN ( SELECT shop_barbers.barber_id FROM shop_barbers WHERE (shop_barbers.barber_id IS NOT NULL)))));
CREATE POLICY "users see own notifications" ON public.notifications FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY barber_insert_own_request ON public.pending_barbers FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY barber_read_own_request ON public.pending_barbers FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY owner_manage_pending_barbers ON public.pending_barbers FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Owners can manage pricing rules" ON public.pricing_rules FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid())))) WITH CHECK ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Public can view active pricing rules" ON public.pricing_rules FOR SELECT TO public USING ((active = true));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO public USING ((id = auth.uid()));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO public USING ((id = auth.uid()));
CREATE POLICY owner_manage_recommendations ON public.recommendations FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid())))) WITH CHECK ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY referral_rewards_select_shop_staff ON public.referral_rewards FOR SELECT TO authenticated USING (((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))) OR (shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true))))));
CREATE POLICY owner_manage_review_responses ON public.review_responses FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid())))) WITH CHECK ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY barber_read_own_reviews ON public.reviews FOR SELECT TO public USING ((barber_id = auth.uid()));
CREATE POLICY owner_manage_reviews ON public.reviews FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid())))) WITH CHECK ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY public_read_visible_reviews ON public.reviews FOR SELECT TO public USING ((visible = true));
CREATE POLICY service_presets_select_authenticated ON public.service_presets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners can manage services" ON public.services FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Public can view active services" ON public.services FOR SELECT TO public USING ((active = true));
CREATE POLICY "Barbers can update their own slot" ON public.shop_barbers FOR UPDATE TO public USING ((barber_id = auth.uid()));
CREATE POLICY "Barbers can view their own shop links" ON public.shop_barbers FOR SELECT TO public USING ((barber_id = auth.uid()));
CREATE POLICY "Owners can manage shop barbers" ON public.shop_barbers FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Public can view active shop barbers" ON public.shop_barbers FOR SELECT TO public USING ((active = true));
CREATE POLICY "Owners can manage their shop invites" ON public.shop_invites FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY "Public can view shop realtime pings" ON public.shop_realtime_pings FOR SELECT TO public USING (true);
CREATE POLICY "Owners can insert shop" ON public.shops FOR INSERT TO public WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY "Owners can update own shop" ON public.shops FOR UPDATE TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Owners can view own shop" ON public.shops FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Public can view shops by code" ON public.shops FOR SELECT TO public USING (true);
CREATE POLICY "Users can delete own square account" ON public.square_accounts FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can insert own square account" ON public.square_accounts FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can read own square account" ON public.square_accounts FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can update own square account" ON public.square_accounts FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Staff can insert own tax info" ON public.staff_tax_info FOR INSERT TO public WITH CHECK ((barber_id = auth.uid()));
CREATE POLICY "Staff can update own tax info" ON public.staff_tax_info FOR UPDATE TO public USING ((barber_id = auth.uid())) WITH CHECK ((barber_id = auth.uid()));
CREATE POLICY "Staff can view own tax info" ON public.staff_tax_info FOR SELECT TO public USING ((barber_id = auth.uid()));
CREATE POLICY "Barbers can insert own tips" ON public.tips FOR INSERT TO public WITH CHECK (((barber_id = auth.uid()) AND (shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true))))));
CREATE POLICY "Barbers can update own tips" ON public.tips FOR UPDATE TO public USING (((barber_id = auth.uid()) AND (shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true)))))) WITH CHECK (((barber_id = auth.uid()) AND (shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true))))));
CREATE POLICY "Barbers can view own tips" ON public.tips FOR SELECT TO public USING ((barber_id = auth.uid()));
CREATE POLICY "Owners can manage tips" ON public.tips FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY owner_manage_unmatched_square_payments ON public.unmatched_square_payments FOR ALL TO public USING ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid())))) WITH CHECK ((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))));
CREATE POLICY vertical_config_select_public ON public.vertical_config FOR SELECT TO public USING (true);
CREATE POLICY allow_public_insert ON public.waitlist FOR INSERT TO anon, authenticated WITH CHECK (((email IS NOT NULL) AND (length(email) > 3) AND (length(email) < 255) AND (email ~~ '%@%'::text)));
CREATE POLICY walk_ins_insert_public ON public.walk_ins FOR INSERT TO public WITH CHECK (true);
CREATE POLICY walk_ins_select_shop_staff ON public.walk_ins FOR SELECT TO authenticated USING (((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))) OR (shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true))))));
CREATE POLICY walk_ins_update_shop_staff ON public.walk_ins FOR UPDATE TO authenticated USING (((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))) OR (shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true)))))) WITH CHECK (((shop_id IN ( SELECT shops.id FROM shops WHERE (shops.owner_id = auth.uid()))) OR (shop_id IN ( SELECT shop_barbers.shop_id FROM shop_barbers WHERE ((shop_barbers.barber_id = auth.uid()) AND (shop_barbers.active = true))))));



CREATE OR REPLACE FUNCTION public.bump_shop_realtime_ping()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop_id uuid := coalesce(new.shop_id, old.shop_id);
begin
  if v_shop_id is not null then
    insert into public.shop_realtime_pings (shop_id, updated_at)
    values (v_shop_id, now())
    on conflict (shop_id) do update set updated_at = now();
  end if;
  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_display_label(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_name is null or trim(p_name) = '' then 'Guest'
    when split_part(trim(p_name), ' ', 2) = '' then split_part(trim(p_name), ' ', 1)
    else split_part(trim(p_name), ' ', 1) || ' ' || upper(left(split_part(trim(p_name), ' ', 2), 1)) || '.'
  end
$function$
;

CREATE OR REPLACE FUNCTION public.create_shop_with_services(p_name text, p_address text, p_city text, p_phone text, p_vertical text, p_custom_services jsonb DEFAULT '[]'::jsonb)
 RETURNS shops
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_shop public.shops;
  v_preset_count integer;
begin
  insert into public.shops (name, address, city, phone, owner_id, vertical)
  values (p_name, p_address, p_city, p_phone, auth.uid(), p_vertical)
  returning * into v_shop;

  insert into public.services (shop_id, name, price, duration_minutes, deposit_required, buffer_before_minutes, buffer_after_minutes)
  select v_shop.id, sp.name, null, sp.duration_minutes, sp.deposit_required, sp.buffer_before_minutes, sp.buffer_after_minutes
  from public.service_presets sp
  where sp.vertical = p_vertical
  order by sp.sort_order;

  get diagnostics v_preset_count = row_count;
  if v_preset_count = 0 then
    raise exception 'No service presets configured for vertical %', p_vertical;
  end if;

  if p_custom_services is not null and jsonb_array_length(p_custom_services) > 0 then
    insert into public.services (shop_id, name, price, duration_minutes, description)
    select
      v_shop.id,
      x->>'name',
      nullif(x->>'price', '')::numeric,
      nullif(x->>'duration_minutes', '')::integer,
      x->>'description'
    from jsonb_array_elements(p_custom_services) as x;
  end if;

  return v_shop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_shop_vertical_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.vertical is distinct from old.vertical and auth.role() <> 'service_role' then
    raise exception 'shops.vertical is immutable via client — contact support to change it';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_tattoo_consent_before_confirm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.find_client_for_booking(p_phone text, p_shop_id uuid)
 RETURNS TABLE(client_id uuid, full_name text, total_visits integer, sms_consent boolean, email_consent boolean, locked_barber_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    c.id,
    c.full_name,
    c.total_visits,
    c.sms_consent,
    c.email_consent,
    (
      SELECT cl.barber_id
      FROM public.client_locks cl
      WHERE cl.client_id = c.id AND cl.shop_id = p_shop_id AND cl.locked = true
      LIMIT 1
    )
  FROM public.clients c
  WHERE c.phone = p_phone
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_referral_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_code text;
  v_exists boolean;
begin
  if new.referral_code is not null then return new; end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    select exists(select 1 from public.clients where referral_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  new.referral_code := v_code;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_shop_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  new_code text;
  exists_already boolean;
begin
  loop
    new_code := upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
                lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    select exists(select 1 from shops where shop_code = new_code) into exists_already;
    exit when not exists_already;
  end loop;
  new.shop_code := new_code;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_referral_reward(p_client_id uuid, p_shop_id uuid)
 RETURNS TABLE(reward_id uuid, reward_type text, reward_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id, reward_type, reward_value
  from public.referral_rewards
  where referring_client_id = p_client_id
    and shop_id = p_shop_id
    and status = 'earned'
  order by earned_at asc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token text)
 RETURNS TABLE(invite_id uuid, token text, shop_barber_id uuid, shop_name text, shop_city text, barber_name text, barber_alias text, compensation_type text, commission_rate numeric, booth_rent_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    i.id, i.token, i.shop_barber_id,
    s.name, s.city,
    sb.barber_name, sb.alias, sb.compensation_type, sb.commission_rate, sb.booth_rent_amount
  from public.invites i
  join public.shops s on s.id = i.shop_id
  left join public.shop_barbers sb on sb.id = i.shop_barber_id
  where i.token = p_token
    and i.accepted = false
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_walkin_status(p_id uuid)
 RETURNS TABLE(status text, queue_position integer, shop_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    w.status,
    (
      SELECT count(*)::integer
      FROM public.walk_ins w2
      WHERE w2.shop_id = w.shop_id
        AND w2.status = 'waiting'
        AND w2.created_at < w.created_at
    ),
    s.name
  FROM public.walk_ins w
  JOIN public.shops s ON s.id = w.shop_id
  WHERE w.id = p_id
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'owner')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_waitlist_slack()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM net.http_post(
    url     := 'https://gobjeojkyrqoibkbeaau.supabase.co/functions/v1/notify-waitlist',
    body    := jsonb_build_object('record', row_to_json(NEW)),
    headers := '{"Content-Type":"application/json","x-internal-secret":"chairos-waitlist-hook"}'::jsonb
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_booth_rent_payment_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() = old.barber_id then
    if new.amount_due is distinct from old.amount_due
       or new.late_fee_amount is distinct from old.late_fee_amount
       or new.total_due is distinct from old.total_due
       or new.due_date is distinct from old.due_date
       or new.shop_id is distinct from old.shop_id
    then
      raise exception 'Only the shop owner can change rent amount or due date fields';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_client_system_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF new.square_customer_id IS DISTINCT FROM old.square_customer_id
       OR new.square_card_id IS DISTINCT FROM old.square_card_id
       OR new.square_card_brand IS DISTINCT FROM old.square_card_brand
       OR new.square_card_last4 IS DISTINCT FROM old.square_card_last4
       OR new.total_visits IS DISTINCT FROM old.total_visits
       OR new.last_visit_date IS DISTINCT FROM old.last_visit_date
    THEN
      RAISE EXCEPTION 'Card-on-file and visit-history fields can only be changed by server-side automation';
    END IF;
  END IF;
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_shop_barber_owner_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() = old.barber_id then
    if new.commission_rate is distinct from old.commission_rate
       or new.tip_split_rate is distinct from old.tip_split_rate
       or new.booth_rent_amount is distinct from old.booth_rent_amount
       or new.booth_rent_due_day is distinct from old.booth_rent_due_day
       or new.late_fee_rate is distinct from old.late_fee_rate
       or new.late_fee_interval is distinct from old.late_fee_interval
       or new.compensation_type is distinct from old.compensation_type
       or new.active is distinct from old.active
       or new.barber_name is distinct from old.barber_name
       or new.alias is distinct from old.alias
       or new.shop_id is distinct from old.shop_id
    then
      raise exception 'Only the shop owner can change compensation, status, or shop assignment fields';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_referral_code(p_code text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id from public.clients where referral_code = upper(p_code) limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.run_client_lock_lapse()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update client_locks set
    locked = false,
    updated_at = now()
  where locked = true
    and loyalty_protected = false
    and last_booking_date < current_date - interval '90 days';

  update client_locks set
    locked = false,
    loyalty_protected = false,
    updated_at = now()
  where locked = true
    and loyalty_protected = true
    and last_booking_date < current_date - interval '365 days';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_kiosk_queue_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then
    delete from public.kiosk_queue_public where id = old.id;
    return old;
  end if;

  if new.status in ('waiting', 'called') then
    insert into public.kiosk_queue_public (id, shop_id, display_label, status, created_at)
    values (new.id, new.shop_id, public.compute_display_label(new.client_name), new.status, new.created_at)
    on conflict (id) do update set status = excluded.status, display_label = excluded.display_label;
  else
    delete from public.kiosk_queue_public where id = new.id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_client_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_client_id uuid;
  v_barber_id uuid;
  v_shop_id uuid;
  v_booking_count integer;
  v_first_booking date;
  v_last_booking date;
  v_months_consecutive numeric;
  v_locked boolean;
  v_loyalty boolean;
  v_lock_threshold integer;
  v_loyalty_months integer;
  v_new_total_visits integer;
  v_referred_by uuid;
  v_referral_enabled boolean;
  v_first_at_shop boolean;
  v_reward_id uuid;
begin
  if new.status != 'done' then return new; end if;
  if new.barber_id is null then return new; end if;

  v_barber_id := new.barber_id;
  v_shop_id := new.shop_id;

  if new.client_id is not null then
    v_client_id := new.client_id;
  else
    select id into v_client_id from clients
    where phone = new.client_phone limit 1;

    if v_client_id is null and new.client_email is not null then
      select id into v_client_id from clients
      where email = new.client_email limit 1;
    end if;

    if v_client_id is null then
      insert into clients (full_name, phone, email)
      values (new.client_name, new.client_phone, new.client_email)
      on conflict (email) do update set phone = excluded.phone
      returning id into v_client_id;
    end if;

    if v_client_id is null then
      select id into v_client_id from clients
      where email = new.client_email limit 1;
    end if;

    update appointments set client_id = v_client_id where id = new.id;
  end if;

  select vc.lock_threshold_bookings, vc.loyalty_months_required
  into v_lock_threshold, v_loyalty_months
  from shops s
  join vertical_config vc on vc.vertical = s.vertical
  where s.id = v_shop_id;

  if v_lock_threshold is null then v_lock_threshold := 2; end if;
  if v_loyalty_months is null then v_loyalty_months := 12; end if;

  select booking_count, first_booking_date, last_booking_date
  into v_booking_count, v_first_booking, v_last_booking
  from client_locks
  where client_id = v_client_id
    and barber_id = v_barber_id
    and shop_id = v_shop_id;

  if not found then
    v_booking_count := 0;
    v_first_booking := new.date;
  end if;

  v_booking_count := v_booking_count + 1;
  v_last_booking := new.date;

  v_locked := v_booking_count >= v_lock_threshold;

  if v_first_booking is not null and v_last_booking is not null then
    v_months_consecutive := (v_last_booking - v_first_booking)::numeric / 30.44;
    v_loyalty := v_months_consecutive >= v_loyalty_months and v_locked;
  else
    v_loyalty := false;
  end if;

  insert into client_locks (
    client_id, barber_id, shop_id,
    booking_count, first_booking_date, last_booking_date,
    locked, loyalty_protected, updated_at
  ) values (
    v_client_id, v_barber_id, v_shop_id,
    v_booking_count, v_first_booking, v_last_booking,
    v_locked, v_loyalty, now()
  )
  on conflict (client_id, barber_id, shop_id)
  do update set
    booking_count = v_booking_count,
    last_booking_date = v_last_booking,
    locked = v_locked,
    loyalty_protected = v_loyalty,
    updated_at = now();

  update clients set
    total_visits = total_visits + 1,
    last_visit_date = new.date
  where id = v_client_id
  returning total_visits, referred_by_client_id into v_new_total_visits, v_referred_by;

  select referral_program_enabled into v_referral_enabled from shops where id = v_shop_id;

  if v_referral_enabled then
    if v_new_total_visits = 1 then
      insert into referral_events (client_id, shop_id, event_type)
      values (v_client_id, v_shop_id, 'first_visit');
    end if;

    if v_referred_by is not null then
      select count(*) = 1 into v_first_at_shop
      from appointments
      where client_id = v_client_id and shop_id = v_shop_id and status = 'done';

      if v_first_at_shop then
        update referral_rewards
        set status = 'earned', earned_at = now()
        where referring_client_id = v_referred_by
          and referred_client_id = v_client_id
          and shop_id = v_shop_id
          and status = 'pending'
        returning id into v_reward_id;

        if v_reward_id is not null then
          insert into referral_events (client_id, shop_id, event_type, reward_id)
          values (v_referred_by, v_shop_id, 'referral_earned', v_reward_id);
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$function$
;



CREATE TRIGGER appointments_bump_shop_ping AFTER INSERT OR DELETE OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION bump_shop_realtime_ping();
CREATE TRIGGER on_appointment_done AFTER UPDATE ON public.appointments FOR EACH ROW WHEN (((new.status = 'done'::text) AND (old.status <> 'done'::text))) EXECUTE FUNCTION update_client_lock();
CREATE TRIGGER on_appointment_done_insert AFTER INSERT ON public.appointments FOR EACH ROW WHEN ((new.status = 'done'::text)) EXECUTE FUNCTION update_client_lock();
CREATE TRIGGER tattoo_consent_required_before_confirm BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION enforce_tattoo_consent_before_confirm();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER booth_rent_payments_protect_owner_fields BEFORE UPDATE ON public.booth_rent_payments FOR EACH ROW EXECUTE FUNCTION protect_booth_rent_payment_fields();
CREATE TRIGGER set_referral_code BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION generate_referral_code();
CREATE TRIGGER trg_protect_client_system_fields BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION protect_client_system_fields();
CREATE TRIGGER shop_barbers_bump_shop_ping AFTER INSERT OR DELETE OR UPDATE ON public.shop_barbers FOR EACH ROW EXECUTE FUNCTION bump_shop_realtime_ping();
CREATE TRIGGER shop_barbers_protect_owner_fields BEFORE UPDATE ON public.shop_barbers FOR EACH ROW EXECUTE FUNCTION protect_shop_barber_owner_fields();
CREATE TRIGGER set_shop_code BEFORE INSERT ON public.shops FOR EACH ROW WHEN ((new.shop_code IS NULL)) EXECUTE FUNCTION generate_shop_code();
CREATE TRIGGER shops_vertical_immutable BEFORE UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION enforce_shop_vertical_immutable();
CREATE TRIGGER waitlist_slack_notify AFTER INSERT ON public.waitlist FOR EACH ROW EXECUTE FUNCTION notify_waitlist_slack();
CREATE TRIGGER walk_ins_sync_kiosk_queue AFTER INSERT OR DELETE OR UPDATE ON public.walk_ins FOR EACH ROW EXECUTE FUNCTION sync_kiosk_queue_public();

