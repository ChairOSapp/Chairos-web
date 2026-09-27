-- F1: missed-call text-back — per-shop Twilio voice number + opt-in flag.
--
-- The shop's Twilio number is the number clients call; when a call to it
-- ends unanswered, POST /api/voice/missed-call texts the caller a booking
-- link. The feature is strictly opt-in (default OFF) so no shop accrues
-- surprise SMS spend, and the platform's billing gate (lib/billing.ts)
-- still applies at send time.

alter table public.shops
  add column if not exists twilio_voice_number text;

alter table public.shops
  add column if not exists missed_call_textback_enabled boolean default false not null;

comment on column public.shops.twilio_voice_number is
  'E.164 Twilio voice number clients call; inbound-call status callbacks for this number drive the missed-call text-back.';
comment on column public.shops.missed_call_textback_enabled is
  'Opt-in for the missed-call text-back. Default false — no surprise SMS spend.';
