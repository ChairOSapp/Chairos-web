ALTER TABLE campaign_recipients ADD COLUMN opened_at timestamptz;
ALTER TABLE campaign_recipients ADD COLUMN clicked_at timestamptz;
ALTER TABLE campaign_recipients ADD COLUMN open_count integer NOT NULL DEFAULT 0;
ALTER TABLE campaign_recipients ADD COLUMN click_count integer NOT NULL DEFAULT 0;
ALTER TABLE campaign_recipients ADD COLUMN resend_email_id text;

CREATE INDEX ON campaign_recipients(resend_email_id);

-- Attribution: which campaign, if any, plausibly drove a given appointment.
-- Nullable/no-op unless a recommendations-style backfill job (or send-time
-- write) actually sets it -- see lib/campaignAttribution.ts.
ALTER TABLE appointments ADD COLUMN campaign_attributed_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX ON appointments(campaign_attributed_id);
