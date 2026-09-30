-- Platform-owned missed-call text-back, sold as a paid add-on ($10/mo).
--
-- Previously the missed-call text-back only worked when the SHOP had its
-- own Twilio account (shops.twilio_voice_number, BYO path — untouched by
-- this migration). Now ChairOS can provision a Twilio number from the
-- platform account for the shop; the shop just forwards unanswered calls
-- to it. Because each number is a real recurring cost, this is a paid
-- add-on, not bundled with the subscription.
--
-- Flow: owner buys the add-on (Stripe subscription item) ->
--   webhook sets missed_call_addon_active ->
--   owner enables the toggle -> platform claims a Twilio number ->
--   stored in missed_call_number, voice webhook pointed at
--   /api/voice/inbound-call.
-- If the add-on is cancelled, the number is released back to Twilio and
-- the columns are cleared; re-enabling later claims a fresh number.

alter table public.shops
  add column if not exists missed_call_addon_active boolean default false not null;

alter table public.shops
  add column if not exists missed_call_number text;

alter table public.shops
  add column if not exists missed_call_stripe_item_id text;

comment on column public.shops.missed_call_addon_active is
  'Paid add-on: missed-call text-back on a ChairOS-provisioned Twilio number. Set by the Stripe webhook when the add-on subscription item is added/removed.';

comment on column public.shops.missed_call_number is
  'E.164 Twilio number provisioned from the platform account for this shop. The shop forwards unanswered calls here; inbound hits POST /api/voice/inbound-call.';

comment on column public.shops.missed_call_stripe_item_id is
  'Stripe subscription item id for the missed-call add-on price, used to remove the add-on.';
