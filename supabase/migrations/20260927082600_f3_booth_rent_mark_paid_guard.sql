-- F3 follow-up (staff/chair audit 2026-09-27): booth-rent barbers could mark
-- their own booth_rent_payments rows paid from the staff dashboard with no
-- payment and no owner verification. Automatic charging
-- (src/trigger/boothRentCharge.ts) uses the service role and is unaffected;
-- the staff "Mark Paid" button was removed from app/dashboard/chair/page.tsx
-- in the same change. Manual/cash collection must be recorded by the shop
-- owner (follow-up: owner-side mark-paid control in the owner dashboard).
DROP POLICY IF EXISTS "Barbers can mark own payment paid" ON public.booth_rent_payments;
