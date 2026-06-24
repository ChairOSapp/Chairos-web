-- SMS and email consent fields for clients (booking flow)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email text;

-- SMS and email consent fields for profiles (owner/barber signup)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_consent_at timestamptz;

-- Index for opt-out webhook lookups by phone
CREATE INDEX IF NOT EXISTS clients_phone_idx ON clients (phone);
