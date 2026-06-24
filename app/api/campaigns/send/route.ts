import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { tasks } from '@trigger.dev/sdk'

export async function POST(req: NextRequest) {
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
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  const { campaignId } = await req.json()

  const { data: campaign } = await admin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Verify owner owns this campaign's shop
  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).eq('id', campaign.shop_id).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Build audience using same logic
  const audienceRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/campaigns/audience`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; '),
    },
    body: JSON.stringify({
      audienceType: campaign.audience_type,
      audienceFilters: campaign.audience_filters,
      channel: campaign.channel,
    }),
  })
  const { clients } = await audienceRes.json()

  if (!clients || clients.length === 0) {
    return NextResponse.json({ recipientCount: 0, triggered: false, message: 'No eligible recipients' })
  }

  // Insert campaign_recipients
  const recipientRows = clients.map((c: any) => ({
    campaign_id: campaignId,
    client_id: c.id,
    phone: c.phone ?? null,
    email: c.email ?? null,
    sms_status: campaign.channel === 'email' ? 'skipped' : 'pending',
    email_status: campaign.channel === 'sms' ? 'skipped' : 'pending',
  }))

  await admin.from('campaign_recipients').insert(recipientRows)

  // Trigger Trigger.dev task
  await tasks.trigger('campaign-send', { campaignId })

  // Update status
  await admin.from('campaigns').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', campaignId)

  return NextResponse.json({ recipientCount: clients.length, triggered: true })
}
