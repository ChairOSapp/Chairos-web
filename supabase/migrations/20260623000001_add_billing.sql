-- Add plan_type and joined_via to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_type text CHECK (plan_type IN ('shop','solo')),
  ADD COLUMN IF NOT EXISTS joined_via text CHECK (joined_via IN ('invite_link','shop_code','solo')),
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;

-- 6-char invite code on shops (distinct from the existing 9-char shop_code used for barber join)
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS invite_code text;

-- Generate invite codes for existing shops that don't have one
UPDATE shops
SET invite_code = upper(substring(md5(random()::text) from 1 for 6))
WHERE invite_code IS NULL;

-- shop_invites: owner-generated invite links (generic, not tied to a specific barber slot)
CREATE TABLE IF NOT EXISTS shop_invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id uuid REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  used boolean DEFAULT false NOT NULL,
  used_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS shop_invites_token_idx ON shop_invites(token);
CREATE INDEX IF NOT EXISTS shop_invites_shop_id_idx ON shop_invites(shop_id);

-- billing_events: immutable audit log of all Stripe webhook events
CREATE TABLE IF NOT EXISTS billing_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id),
  stripe_event_id text UNIQUE,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_events_profile_id_idx ON billing_events(profile_id);
CREATE INDEX IF NOT EXISTS billing_events_stripe_event_id_idx ON billing_events(stripe_event_id);

-- RLS on shop_invites
ALTER TABLE shop_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their shop invites"
  ON shop_invites FOR ALL
  USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()));

CREATE POLICY "Anyone can read an invite by token"
  ON shop_invites FOR SELECT
  USING (true);

-- RLS on billing_events: service role only (no user-facing policies)
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- No user-facing SELECT policy — service role bypasses RLS

-- Run: npx supabase db push
