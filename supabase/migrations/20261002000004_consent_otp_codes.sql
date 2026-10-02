-- Consent signing OTP: proves phone ownership before the template route
-- hands out PII or mints a signing token (M3/M5).
CREATE TABLE public.consent_otp_codes (
  phone text NOT NULL PRIMARY KEY,
  code_hash text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.consent_otp_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.consent_otp_codes FOR ALL TO public USING (false);
