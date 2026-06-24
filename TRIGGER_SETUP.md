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

## 4. Deploy tasks to Trigger.dev

```bash
npm run trigger:deploy
```

Run this command after **every change** to a file in `src/trigger/`. Tasks run on Trigger.dev's own infrastructure — Vercel does not need to change.

## 5. Wiring up abandoned booking recovery

The `triggerAbandonedBooking` server action is in `app/actions/triggerAbandonedBooking.ts`.
Call it from the booking flow when a session goes stale:

```typescript
import { triggerAbandonedBooking } from '@/app/actions/triggerAbandonedBooking'

// When the user leaves step 3 without completing the booking:
await triggerAbandonedBooking({
  bookingSessionId: sessionId,   // store in booking_sessions with status='abandoned' first
  clientPhone: phone,
  clientName: name,
  shopName: shop.name,
  barberId: selectedBarber.id,
  barberName: selectedBarber.barber_name,
})
```

Mark the session completed when booking succeeds:
```typescript
await supabase
  .from('booking_sessions')
  .update({ status: 'completed' })
  .eq('session_id', sessionId)
```

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
