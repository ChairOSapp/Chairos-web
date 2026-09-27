-- Appointment duration: the service sets it, the owner can override it.
-- Backfills existing appointments from their service (or 30 min).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

UPDATE public.appointments a
SET duration_minutes = COALESCE(s.duration_minutes, 30)
FROM public.services s
WHERE a.duration_minutes IS NULL
  AND a.service_id IS NOT NULL
  AND s.id = a.service_id;

UPDATE public.appointments
SET duration_minutes = 30
WHERE duration_minutes IS NULL;
