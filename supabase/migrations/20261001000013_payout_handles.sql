-- Payout handles for QR-code checkout (Venmo, Cash App, Zelle).
-- Owners set these in Shop Settings; chairs set their own in Chair
-- Settings when the shop lets barbers collect their own payments.
-- Idempotent: safe to run multiple times.

-- 1. Shop-level handles (the owner's receiving accounts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shops' AND column_name = 'venmo_handle'
  ) THEN
    ALTER TABLE shops ADD COLUMN venmo_handle TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shops' AND column_name = 'cashapp_handle'
  ) THEN
    ALTER TABLE shops ADD COLUMN cashapp_handle TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shops' AND column_name = 'zelle_handle'
  ) THEN
    ALTER TABLE shops ADD COLUMN zelle_handle TEXT;
  END IF;
END $$;

-- 2. Barber-level handles (per barber per shop, same as alias/bio/photo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shop_barbers' AND column_name = 'venmo_handle'
  ) THEN
    ALTER TABLE shop_barbers ADD COLUMN venmo_handle TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shop_barbers' AND column_name = 'cashapp_handle'
  ) THEN
    ALTER TABLE shop_barbers ADD COLUMN cashapp_handle TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shop_barbers' AND column_name = 'zelle_handle'
  ) THEN
    ALTER TABLE shop_barbers ADD COLUMN zelle_handle TEXT;
  END IF;
END $$;
