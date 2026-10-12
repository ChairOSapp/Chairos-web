import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireActiveBilling } from '@/lib/billing'
import { checkRateLimit } from '@/lib/rate-limit'
import { planFillAhead } from '@/lib/fillAhead'
import { notifyNextWaitlistCandidate, normalizeWaitlistPhone } from '@/lib/waitlistNotify'

// Fill Ahead send: re-plan for the target date, write one waitlist row
// per candidate (the claim machinery's native currency), then offer each
// slot to its first candidate through the same notify path the Refill
// uses. A YES reply books the appointment through the existing inbound
// SMS webhook; a non-reply expires in 30 minutes and the claim sweep
// cascades to the slot's backup candidates automatically.
//
// One send per slot per day: offers already sent today (recorded in
// automation_logs by this route) are skipped, so a double-tap or a
// second device can't pitch the same chair twice.

export async function POST(req: NextRequest) {
  try {
    return await handleSend(req)
  } catch (err) {
    console.error('[fill-ahead/send] unhandled error', err)
    return NextResponse.json(
      { error: `Fill Ahead send hit a server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}

async function handleSend(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { date, today } = await req.json() as { date?: string; today?: string }
  if (!date || !today || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return NextResponse.json({ error: 'date and today are required (YYYY-MM-DD)' }, { status: 400 })
  }

  // Resolve the caller's shop: their own if they own one, else the shop
  // they actively work at (solo chairs own their shop, so the first
  // branch covers them).
  let shopId: string | null = null
  {
    const { data: owned } = await admin
      .from('shops')
      .select('id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (owned?.id) shopId = owned.id as string
    else {
      const { data: staffRow } = await admin
        .from('shop_barbers')
        .select('shop_id')
        .eq('barber_id', user.id)
        .eq('active', true)
        .limit(1)
        .maybeSingle()
      shopId = (staffRow?.shop_id as string) ?? null
    }
  }
  if (!shopId) return NextResponse.json({ error: 'No shop found for this account' }, { status: 403 })

  // Billing gate + rate limit: offers burn Twilio spend, same posture as
  // campaign sends.
  const billingBlock = await requireActiveBilling(admin, user.id)
  if (billingBlock) return billingBlock

  const sendLimit = await checkRateLimit('fillAheadSend', `user:${user.id}`)
  if (!sendLimit.ok) {
    return NextResponse.json(
      { error: 'Too many Fill Ahead sends. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(sendLimit.retryAfterSeconds) } }
    )
  }

  const plan = await planFillAhead(admin, shopId, date, today)
  if (plan.offers.length === 0) {
    return NextResponse.json({ offersSent: 0, totalValue: 0, message: 'No open spots to fill for that day.' })
  }

  // Slots already offered today are skipped (see the header note).
  const { data: sentToday } = await admin
    .from('automation_logs')
    .select('payload')
    .eq('type', 'fill_ahead_offer')
    .eq('payload->>shopId', shopId)
    .eq('payload->>sentOn', today)
  const sentKeys = new Set(
    (sentToday || []).map(r => {
      const p = r.payload as { date?: string; time?: string; barberId?: string }
      return `${p.date}|${p.time}|${p.barberId}`
    })
  )

  let offersSent = 0
  let totalValue = 0
  const results: { time: string; barberName: string; result: string }[] = []

  for (const offer of plan.offers) {
    const timeWithSeconds = `${offer.time}:00`
    const key = `${offer.date}|${timeWithSeconds}|${offer.barberId}`
    if (sentKeys.has(key)) {
      results.push({ time: offer.timeDisplay, barberName: offer.barberName, result: 'already_sent_today' })
      continue
    }

    // Write the candidates as waitlist rows for this exact slot. The
    // inbound-claim matcher looks rows up by bare 10-digit phone, so the
    // phone is stored in that form (the join flow stores as-entered;
    // this path normalizes deliberately).
    const rows = offer.candidates.map((c, i) => {
      const phone = normalizeWaitlistPhone(c.clientPhone)
      return {
        shop_id: shopId,
        client_id: c.clientId,
        client_name: c.clientName,
        client_phone: phone ? phone.bare : c.clientPhone,
        staff_id: offer.barberId,
        service_id: offer.serviceId,
        desired_date: offer.date,
        desired_time: timeWithSeconds,
        status: 'waiting',
        position: i + 1,
      }
    })
    const { error: insertErr } = await admin.from('appointment_waitlist').insert(rows)
    if (insertErr) {
      await admin.from('automation_logs').insert({
        type: 'fill_ahead_offer',
        payload: { shopId, date: offer.date, time: timeWithSeconds, barberId: offer.barberId, serviceId: offer.serviceId, sentOn: today },
        result: `insert_error:${insertErr.message}`,
      })
      results.push({ time: offer.timeDisplay, barberName: offer.barberName, result: 'insert_error' })
      continue
    }

    const outcome = await notifyNextWaitlistCandidate(admin, {
      shopId,
      serviceId: offer.serviceId,
      date: offer.date,
      time: timeWithSeconds,
      barberId: offer.barberId,
    })

    const result = outcome.notified ? 'notified' : outcome.reason
    await admin.from('automation_logs').insert({
      type: 'fill_ahead_offer',
      payload: {
        shopId,
        date: offer.date,
        time: timeWithSeconds,
        barberId: offer.barberId,
        serviceId: offer.serviceId,
        sentOn: today,
        leadClientId: offer.candidates[0]?.clientId ?? null,
        candidateCount: offer.candidates.length,
      },
      result,
    })
    if (outcome.notified) {
      offersSent++
      totalValue += offer.price ?? 0
    }
    results.push({ time: offer.timeDisplay, barberName: offer.barberName, result })
  }

  return NextResponse.json({ offersSent, totalValue, results })
}
