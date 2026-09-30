import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireActiveBilling } from '@/lib/billing'
import { logger } from '@/lib/logger'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function authedUser() {
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
  return user
}

/** Pull a NANP area code out of the shop's phone number, if it has one. */
function areaCodeFrom(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length === 10) return digits.slice(0, 3)
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4)
  return null
}

/**
 * POST — claim a Twilio number from the PLATFORM account for this shop's
 * missed-call text-back. Requires the paid add-on. Reuses the shop's
 * existing number when one is already assigned (disable/re-enable is free).
 *
 * Prefers a local number matching the shop's area code so callers see a
 * familiar number; falls back to toll-free when nothing local is
 * available. The number's voice webhook points at /api/voice/inbound-call
 * and its SMS webhook at /api/sms/optout (so STOP/HELP keep working).
 */
export async function POST(_req: NextRequest) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: 'Texting is not configured.' }, { status: 500 })
  }

  const user = await authedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = admin()
  const billingBlock = await requireActiveBilling(supabase, user.id)
  if (billingBlock) return billingBlock

  const { data: shop } = await supabase
    .from('shops')
    .select('id, phone, missed_call_addon_active, missed_call_number')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'No shop found.' }, { status: 404 })

  if (!shop.missed_call_addon_active) {
    return NextResponse.json({ error: 'addon_required' }, { status: 402 })
  }

  // Reuse: disabling and re-enabling the toggle must not burn a new number.
  if (shop.missed_call_number) {
    return NextResponse.json({ ok: true, number: shop.missed_call_number, reused: true })
  }

  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chairos.cc'
    const voiceUrl = `${siteUrl}/api/voice/inbound-call`
    const smsUrl = `${siteUrl}/api/sms/optout`

    let target: string | null = null
    let kind: 'local' | 'toll-free' = 'local'
    const areaCode = areaCodeFrom(shop.phone)
    if (areaCode) {
      const locals = await client.availablePhoneNumbers('US').local.list({
        areaCode: parseInt(areaCode, 10),
        limit: 3,
        voiceEnabled: true,
        smsEnabled: true,
      })
      target = locals[0]?.phoneNumber ?? null
    }
    if (!target) {
      kind = 'toll-free'
      const frees = await client.availablePhoneNumbers('US').tollFree.list({
        limit: 3,
        voiceEnabled: true,
        smsEnabled: true,
      })
      target = frees[0]?.phoneNumber ?? null
    }
    if (!target) {
      logger.error('missed_call_provision_no_numbers', { shopId: shop.id, areaCode })
      return NextResponse.json({ error: 'No numbers available right now. Try again later.' }, { status: 503 })
    }

    const bought = await client.incomingPhoneNumbers.create({
      phoneNumber: target,
      friendlyName: `ChairOS missed-call ${shop.id.slice(0, 8)}`,
      voiceUrl,
      voiceMethod: 'POST',
      smsUrl,
      smsMethod: 'POST',
    })

    await supabase
      .from('shops')
      .update({ missed_call_number: bought.phoneNumber })
      .eq('id', shop.id)

    logger.info('missed_call_number_provisioned', { shopId: shop.id, number: bought.phoneNumber, kind })
    return NextResponse.json({ ok: true, number: bought.phoneNumber, kind })
  } catch (err: any) {
    logger.error('missed_call_provision_failed', { message: err.message })
    return NextResponse.json({ error: 'Could not get a number right now. Try again.' }, { status: 500 })
  }
}
