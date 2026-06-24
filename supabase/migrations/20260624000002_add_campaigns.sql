CREATE TABLE campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id),
  name text NOT NULL,
  intent text NOT NULL,
  channel text CHECK (channel IN ('sms','email','both')),
  audience_type text CHECK (audience_type IN (
    'all_clients',
    'lapsed_clients',
    'specific_barber',
    'specific_service',
    'no_booking_since',
    'manual_list'
  )),
  audience_filters jsonb,
  sms_message text,
  email_subject text,
  email_body text,
  ai_generated boolean DEFAULT false,
  status text DEFAULT 'draft' CHECK (status IN (
    'draft','scheduled','sending','sent','cancelled'
  )),
  schedule_type text CHECK (schedule_type IN ('now','once','recurring')),
  scheduled_at timestamptz,
  recurrence_rule text,
  recurrence_end_at timestamptz,
  recurrence_count integer,
  sent_count integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE campaign_recipients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id),
  phone text,
  email text,
  sms_status text DEFAULT 'pending',
  email_status text DEFAULT 'pending',
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE campaign_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  run_at timestamptz DEFAULT now(),
  recipients_count integer,
  sent_count integer,
  failed_count integer,
  trigger_type text CHECK (trigger_type IN ('manual','scheduled','recurring'))
);

-- RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_runs ENABLE ROW LEVEL SECURITY;

-- Owners can manage campaigns for their shop
CREATE POLICY "Owners manage their campaigns"
  ON campaigns FOR ALL
  USING (
    shop_id IN (
      SELECT id FROM shops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners manage campaign recipients"
  ON campaign_recipients FOR ALL
  USING (
    campaign_id IN (
      SELECT c.id FROM campaigns c
      JOIN shops s ON s.id = c.shop_id
      WHERE s.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners manage campaign runs"
  ON campaign_runs FOR ALL
  USING (
    campaign_id IN (
      SELECT c.id FROM campaigns c
      JOIN shops s ON s.id = c.shop_id
      WHERE s.owner_id = auth.uid()
    )
  );

-- Run: npx supabase db push
