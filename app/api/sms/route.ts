import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/retry'
import { requireActiveBilling } from '@/lib/billing'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()

  try {
    let { to, message, appointmentId } = await req.json() as { to?: string; message?: string; appointmentId?: string }

    if (!to) {
      return NextResponse.json({ error: 'Missing to' }, { status: 400 })
    }

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // clients.phone is stored inconsistently (some E.164, some bare
    // 10-digit), so match against both forms.
    const digits = String(to).replace(/\D/g, '')
    const bare = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
    const e164 = `+1${bare}`

    const { data: client } = await admin
      .from('clients')
      .select('id, sms_consent')
      .in('phone', [bare, e164])
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    if (!client.sms_consent) {
      return NextResponse.json({ error: 'This client has not consented to SMS' }, { status: 403 })
    }

    if (user) {
      if (!message) {
        return NextResponse.json({ error: 'Missing message' }, { status: 400 })
      }
      // Bound message size: Twilio bills per segment, so cap the
      // staff-authored path at 10 segments.
      if (message.length > 1600) {
        return NextResponse.json({ error: 'Message is too long (max 1600 characters)' }, { status: 400 })
      }
      // Billing gate: the authenticated path spends the platform's Twilio
      // budget on the sender's behalf, so expired trials and cancelled
      // accounts get a 402 before any message is composed or sent. (The
      // anonymous booking-confirmation path below is the public booking
      // flow and is intentionally not gated here.)
      const billingBlock = await requireActiveBilling(admin, user.id)
      if (billingBlock) return billingBlock

      // Owner/staff path: resolve which shop(s) this account may send SMS
      // on behalf of, so this can't be used as an open relay to text
      // arbitrary numbers using the platform's shared Twilio sender.
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
      let shopIds: string[] = []
      if (profile?.role === 'owner') {
        const { data: shops } = await admin.from('shops').select('id').eq('owner_id', user.id)
        shopIds = (shops ?? []).map((s: any) => s.id)
      } else {
        const { data: sb } = await admin.from('shop_barbers').select('shop_id').eq('barber_id', user.id).eq('active', true)
        shopIds = (sb ?? []).map((s: any) => s.shop_id)
      }
      if (shopIds.length === 0) {
        return NextResponse.json({ error: 'No shop found for this account' }, { status: 403 })
      }

      const { data: membership } = await admin
        .from('client_shop_memberships')
        .select('shop_id')
        .eq('client_id', client.id)
        .in('shop_id', shopIds)
        .maybeSingle()

      if (!membership) {
        return NextResponse.json({ error: 'Client is not associated with your shop' }, { status: 403 })
      }
    } else {
      // Anonymous path: the public booking flow's own confirmation text.
      // The caller proves the booking by naming the just-created
      // appointment; the message is composed server-side from the
      // appointment/shop/service so this endpoint can never be used to
      // send attacker-composed SMS from the platform's Twilio number
      // (previously any free-form `message` was accepted).
      if (!appointmentId) {
        return NextResponse.json({ error: 'appointmentId is required' }, { status: 400 })
      }
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: appt } = await admin
        .from('appointments')
        .select('id, client_id, barber_id, date, time, services(name), shops(name)')
        .eq('id', appointmentId)
        .eq('client_id', client.id)
        .gte('created_at', since)
        .maybeSingle()

      if (!appt) {
        return NextResponse.json({ error: 'No recent booking found for this client' }, { status: 403 })
      }

      let barberLabel = 'your barber'
      if ((appt as any).barber_id) {
        const { data: staff } = await admin
          .from('shop_barbers')
          .select('barber_name, alias')
          .eq('barber_id', (appt as any).barber_id)
          .maybeSingle()
        barberLabel = (staff as any)?.barber_name || (staff as any)?.alias || barberLabel
      }
      const dateFormatted = new Date(`${(appt as any).date}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
      const timeFormatted = String((appt as any).time).slice(0, 5)
      const serviceName = ((appt as any).services as any)?.name || 'appointment'
      const shopName = ((appt as any).shops as any)?.name || 'the shop'
      message = `You're booked at ${shopName}!\n\nService: ${serviceName}\nBarber: ${barberLabel}\nDate: ${dateFormatted}\nTime: ${timeFormatted}\n\nSee you soon! Reply STOP to opt out.`
    }

    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )

    const phone = e164

    const result = await withRetry('twilio_sms', () => twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: phone
    }))

    logger.info('sms_sent', { to: phone.slice(-4), messageSid: result.sid })
    return NextResponse.json({ success: true, sid: result.sid })
  } catch (err: any) {
    logger.error('sms_send_failed', { message: err.message })
    Sentry.captureException(err, { tags: { job: 'sms_send' } })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
