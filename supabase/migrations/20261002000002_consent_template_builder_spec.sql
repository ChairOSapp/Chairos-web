-- Consent builder spec: remembers how a template was generated so the
-- signing flow can render the native form and re-render the signed PDF.
-- NULL for shop-uploaded PDFs (legacy viewer flow).
ALTER TABLE public.consent_form_templates
  ADD COLUMN builder_spec JSONB;
