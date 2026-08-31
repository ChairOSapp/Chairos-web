# Trigger.dev Setup

## 1. Create a Trigger.dev account and project

1. Go to https://trigger.dev and sign up
2. Create a new project
3. Copy the **Project Ref** (e.g. `proj_abc123`) → paste into `TRIGGER_PROJECT_REF` in `.env.local`
4. Go to **API Keys** in the dashboard → copy the **Secret Key** → paste into `TRIGGER_SECRET_KEY` in `.env.local`

Also add your Anthropic API key to `.env.local`:
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com → API Keys

## 2. Apply database migrations

The following tables are new and must be created before deploying tasks:

```bash
npx supabase db push
```

Tables created:
- `lapse_alerts` — tracks which clients have been flagged as lapsed
- `automation_logs` — audit log for every SMS sent via Trigger.dev
- `booking_sessions` — tracks abandoned booking sessions for recovery

## 3. Add Trigger.dev env vars to Vercel

In Vercel → your project → Settings → Environment Variables, add:
- `TRIGGER_SECRET_KEY`
- `TRIGGER_PROJECT_REF`
- `ANTHROPIC_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (if not already there)
- `BOOKING_ABANDON_TIMEOUT_MINUTES` (optional, default 20) — how long a booking page can sit idle before it's swept as abandoned

## 4. Deploy tasks to Trigger.dev

```bash
npm run trigger:deploy
```

Run this command after **every change** to a file in `src/trigger/`. Tasks run on Trigger.dev's own infrastructure — Vercel does not need to change.

## 5. Abandoned booking recovery

Unlike the other automations, this one isn't triggered from application
code at all -- it follows the same scan-based pattern as
`depositHoldExpiration`. The public booking page (`app/book/[shopCode]/page.tsx`)
writes an in-progress session to `booking_sessions` via `POST /api/book/session`
as soon as the visitor has entered name + phone + a selected service/date/time,
and marks it `completed` via `POST /api/book/session/complete` once a real
appointment is created.

`src/trigger/abandonedBookingSweep.ts` runs on a cron (every 5 minutes) and
finds sessions still `in_progress` after `BOOKING_ABANDON_TIMEOUT_MINUTES`
(default 20) of inactivity, marks them `abandoned`, and sends one recovery
text per session:

- Deposit-required service: a reminder with a link back to the booking
  page (`/book/[shopCode]?session=<id>`) that restores their selections
  and drops them at the payment step.
- No deposit required: a text asking them to reply YES/BOOK/CONFIRM,
  handled by the inbound-reply branch added to `app/api/sms/optout/route.ts`
  (the same webhook Twilio is already configured to call for STOP/START/HELP).

## 6. Triggering personalized rebooking SMS manually

Use `triggerReBookingSms` from `app/actions/triggerReBookingSms.ts`:

```typescript
import { triggerReBookingSms } from '@/app/actions/triggerReBookingSms'

await triggerReBookingSms({
  clientPhone: '+15551234567',
  clientName: 'Marcus',
  barberName: 'Jordan',
  shopName: 'Kings of Cuts',
  daysSinceVisit: 63,
  lastServiceName: 'Fade & Line-up',
})
```

## Deprecated env vars (n8n)

Once Trigger.dev automation is confirmed working, these can be removed:

```
# N8N_WEBHOOK_URL  (deprecated — replaced by Trigger.dev tasks)
# N8N_API_KEY      (deprecated — replaced by Trigger.dev tasks)
```
