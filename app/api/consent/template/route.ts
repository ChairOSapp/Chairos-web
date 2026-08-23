import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public route: clients have no Supabase Auth session, so the appointment
// itself (an unguessable UUID they were given at booking) is the access
// key. consent_form_templates has no client-facing RLS policy at all
// (owner-only, per Task 1) — this route is the only way a client ever
// sees an active template, and it uses the service role deliberately.
export async function GET(req: NextRequest) {
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
    .select('id, version')
    .eq('shop_id', appointment.shop_id)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!template) {
    return NextResponse.json({ error: 'No active consent form for this shop' }, { status: 404 })
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

  return NextResponse.json({
    alreadySigned: false,
    templateId: template.id,
    version: template.version,
    signedUrl: signedUrlData.signedUrl,
    shopName: shop?.name || 'the shop',
    clientName: appointment.client_name,
  })
}
