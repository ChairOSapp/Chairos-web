interface BuilderSpec {
  stateCode: string
  vertical: 'tattoo' | 'barber' | 'salon'
  options: { photoRelease: boolean; chemicalServices: boolean; straightRazor: boolean }
}

/**
 * Build the full consent-signing payload for an appointment. Called ONLY
 * after the client proves phone ownership via OTP — never on a bare
 * appointment UUID (M3/M5).
 */
export async function getTemplatePayload(admin: any, appointmentId: string) {
  const { data: appointment, error: apptErr } = await admin
    .from('appointments')
    .select('id, shop_id, client_id, client_name')
    .eq('id', appointmentId)
    .maybeSingle()
  if (apptErr || !appointment) {
    return { error: 'Appointment not found', status: 404 }
  }

  const { data: shop } = await admin
    .from('shops')
    .select('name')
    .eq('id', appointment.shop_id)
    .maybeSingle()

  let template: { id: string; version: number; vertical?: string; builder_spec?: BuilderSpec | null } | null = null
  {
    const { data, error } = await admin
      .from('consent_form_templates')
      .select('id, version, vertical, builder_spec')
      .eq('shop_id', appointment.shop_id)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!error) {
      template = data
    } else if (error.code === '42703') {
      const retry = await admin
        .from('consent_form_templates')
        .select('id, version, vertical')
        .eq('shop_id', appointment.shop_id)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      template = retry.data
    } else {
      return { error: 'Could not load consent form', status: 500 }
    }
  }

  if (!template) {
    return { error: 'No active consent form for this shop', status: 404 }
  }

  let clientPhone: string | null = null
  let clientEmail: string | null = null
  if (appointment.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('phone, email')
      .eq('id', appointment.client_id)
      .maybeSingle()
    clientPhone = client?.phone ?? null
    clientEmail = client?.email ?? null
  }

  if (appointment.client_id) {
    const { data: existing } = await admin
      .from('consent_form_signatures')
      .select('access_token')
      .eq('template_id', template.id)
      .eq('client_id', appointment.client_id)
      .maybeSingle()
    if (existing) {
      return { alreadySigned: true, accessToken: existing.access_token }
    }
  }

  const { data: rawTemplate } = await admin
    .from('consent_form_templates')
    .select('file_path')
    .eq('id', template.id)
    .maybeSingle()
  if (!rawTemplate) {
    return { error: 'Template file missing', status: 500 }
  }

  const { data: signedUrlData, error: signedUrlErr } = await admin.storage
    .from('consent-templates')
    .createSignedUrl(rawTemplate.file_path, 900)
  if (signedUrlErr || !signedUrlData) {
    return { error: 'Could not generate a link to the consent form', status: 500 }
  }

  const { data: existingToken } = await admin
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
    token = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { error: tokenErr } = await admin
      .from('consent_signing_tokens')
      .insert({
        appointment_id: appointment.id,
        template_id: template.id,
        token,
        expires_at: expiresAt,
      })
    if (tokenErr) {
      return { error: 'Could not issue signing token', status: 500 }
    }
  }

  return {
    alreadySigned: false,
    templateId: template.id,
    version: template.version,
    vertical: (template as { vertical?: string }).vertical ?? null,
    builderSpec: template.builder_spec ?? null,
    signedUrl: signedUrlData.signedUrl,
    shopName: shop?.name || 'the shop',
    clientName: appointment.client_name,
    clientPhone,
    clientEmail,
    signingToken: token,
  }
}
