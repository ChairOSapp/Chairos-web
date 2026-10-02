-- Security audit fixes (2026-10-02): close RLS/policy holes found in the
-- compliance audit. Safe to run multiple times (IF NOT EXISTS / OR REPLACE
-- guards where possible).

-- ── H1: tattoo-consent gate bypass ──────────────────────────────
-- Anonymous INSERTs on clients could set physical_consent_on_file and other
-- system fields because the guard trigger only fired on UPDATE. Mirror the
-- UPDATE guard for INSERT: only the service role may set system/consent
-- fields on a new client row.
CREATE OR REPLACE FUNCTION public.protect_client_system_fields_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NEW.physical_consent_on_file IS DISTINCT FROM false
       OR NEW.square_customer_id IS NOT NULL
       OR NEW.square_card_id IS NOT NULL
       OR NEW.square_card_brand IS NOT NULL
       OR NEW.square_card_last4 IS NOT NULL
       OR NEW.total_visits IS DISTINCT FROM 0
       OR NEW.last_visit_date IS NOT NULL
    THEN
      RAISE EXCEPTION 'System and consent fields can only be set by server-side automation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_client_system_fields_on_insert ON public.clients;
CREATE TRIGGER trg_protect_client_system_fields_on_insert
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.protect_client_system_fields_on_insert();

-- ── H5: anonymous notification forgery ──────────────────────────
-- A stale permissive INSERT policy was never dropped; permissive RLS
-- policies are OR'd, so the weaker one still governed. Drop it.
DROP POLICY IF EXISTS notifications_insert_shop_relationship ON public.notifications;

-- ── L-R2: notification UPDATE policies lack WITH CHECK ──────────
-- Without WITH CHECK a user can rewrite their row's user_id to a victim's.
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── L-R1: feedback forgery ──────────────────────────────────────
-- Any signed-in user could insert feedback rows as another user.
DROP POLICY IF EXISTS app_feedback_insert ON public.app_feedback;
CREATE POLICY app_feedback_insert
  ON public.app_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── L-P2: Stripe webhook dedupe needs a real constraint ─────────
-- Check-then-insert can double-apply under concurrency. This fails if
-- duplicate stripe_event_id rows already exist — dedupe them first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_events_stripe_event_id_unique'
  ) THEN
    ALTER TABLE public.billing_events
      ADD CONSTRAINT billing_events_stripe_event_id_unique UNIQUE (stripe_event_id);
  END IF;
END $$;

-- ── L-E1: consent double-sign needs a real constraint ───────────
-- The "already signed" guard is check-then-insert. Back it with a unique
-- constraint so concurrent submits can't create two signature rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consent_form_signatures_template_client_unique'
  ) THEN
    ALTER TABLE public.consent_form_signatures
      ADD CONSTRAINT consent_form_signatures_template_client_unique UNIQUE (template_id, client_id);
  END IF;
END $$;
