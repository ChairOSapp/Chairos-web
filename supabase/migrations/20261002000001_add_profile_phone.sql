-- Mission Control outreach: store the account's mobile number so the founder
-- can text users from the admin dossier. Consent is tracked by the existing
-- sms_consent / sms_consent_at columns (collected at signup).
alter table public.profiles
  add column if not exists phone text;
