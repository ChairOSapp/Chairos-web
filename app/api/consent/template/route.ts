import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Public route: clients have no Supabase Auth session, so the appointment
// itself (an unguessable UUID they were given at booking) is the access
// key. consent_form_templates has no client-facing RLS policy at all
// (owner-only, per Task 1) — this route is the only way a client ever
// sees an active template, and it uses the service role deliberately.
export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  const appointmentId = req.nextUrl.searchParams.get('appointmentId')
  if (!appointmentId) {
    return NextResponse.json({ error: 'appointmentId is required' }, { status: 400 })
  }

  const { data: appointment, error: apptErr } = await supabase
    .from('appointments')
    .select('id, shop_id, client_id, client_name')
    .eq('id', appointmentId)
    .maybeSingle()
  if (apptErr || !appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('name')
    .eq('id', appointment.shop_id)
    .maybeSingle()

  const { data: template } = await supabase
    .from('consent_form_templates')
    .select('id, version, vertical')
    .eq('shop_id', appointment.shop_id)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!template) {
    return NextResponse.json({ error: 'No active consent form for this shop' }, { status: 404 })
  }

  // Client contact for pre-filling the digital signing form.
  let clientPhone: string | null = null
  let clientEmail: string | null = null
  if (appointment.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('phone, email')
      .eq('id', appointment.client_id)
      .maybeSingle()
    clientPhone = client?.phone ?? null
    clientEmail = client?.email ?? null
  }

  if (appointment.client_id) {
    const { data: existing } = await supabase
      .from('consent_form_signatures')
      .select('access_token')
      .eq('template_id', template.id)
      .eq('client_id', appointment.client_id)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ alreadySigned: true, accessToken: existing.access_token })
    }
  }

  const { data: rawTemplate } = await supabase
    .from('consent_form_templates')
    .select('file_path')
    .eq('id', template.id)
    .maybeSingle()
  if (!rawTemplate) {
    return NextResponse.json({ error: 'Template file missing' }, { status: 500 })
  }

  const { data: signedUrlData, error: signedUrlErr } = await supabase.storage
    .from('consent-templates')
    .createSignedUrl(rawTemplate.file_path, 900)
  if (signedUrlErr || !signedUrlData) {
    return NextResponse.json({ error: 'Could not generate a link to the consent form' }, { status: 500 })
  }

  // Reuse an existing unused, unexpired token for this appointment+template
  // instead of minting a new one on every page load.
  const { data: existingToken } = await supabase
    .from('consent_signing_tokens')
    .select('token')
    .eq('appointment_id', appointment.id)
    .eq('template_id', template.id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let token: string
  if (existingToken) {
    token = existingToken.token
  } else {
    // Issue a single-use signing token (24h expiry). The Edge Function will
    // require this token — bare appointment UUIDs are no longer trusted.
    token = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { error: tokenErr } = await supabase
      .from('consent_signing_tokens')
      .insert({
        appointment_id: appointment.id,
        template_id: template.id,
        token,
        expires_at: expiresAt,
      })
    if (tokenErr) {
      return NextResponse.json({ error: 'Could not issue signing token' }, { status: 500 })
    }
  }

  return NextResponse.json({
    alreadySigned: false,
    templateId: template.id,
    version: template.version,
    vertical: (template as { vertical?: string }).vertical ?? null,
    signedUrl: signedUrlData.signedUrl,
    shopName: shop?.name || 'the shop',
    clientName: appointment.client_name,
    clientPhone,
    clientEmail,
    signingToken: token,
  })
}
