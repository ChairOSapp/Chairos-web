import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResend } from '@/lib/resend'
import { checkRateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain || !local) return 'your email on file'
  return `${local.slice(0, 1)}•••@${domain}`
}

// POST: email the signed PDF to the client on file. Gated by the
// signature's own access_token, same as the GET on the parent route —
// the token is the client's only credential for their signed copy.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const limit = await checkRateLimit('email', `consent-copy:${token}`)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Wait a minute and try again.' },
      { status: 429 }
    )
  }

  const supabase = getSupabase()
  const { data: signature, error } = await supabase
    .from('consent_form_signatures')
    .select('signed_pdf_path, signed_at, shop_id, client_id')
    .eq('access_token', token)
    .maybeSingle()
  if (error || !signature) {
    return NextResponse.json({ error: 'Signed document not found' }, { status: 404 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('name, email')
    .eq('id', signature.client_id)
    .maybeSingle()
  if (!client?.email) {
    return NextResponse.json(
      { error: 'There is no email address on file for this form. Ask the shop to add one and try again.' },
      { status: 422 }
    )
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('name')
    .eq('id', signature.shop_id)
    .maybeSingle()
  const shopName = shop?.name || 'your shop'

  const { data: pdfBlob, error: dlErr } = await supabase.storage
    .from('consent-signed')
    .download(signature.signed_pdf_path)
  if (dlErr || !pdfBlob) {
    logger.error('consent_copy_download_failed', { message: dlErr?.message || 'no data' })
    return NextResponse.json({ error: 'Could not load the signed document' }, { status: 500 })
  }
  const pdfBase64 = Buffer.from(await pdfBlob.arrayBuffer()).toString('base64')

  const firstName = (client.name || '').split(' ')[0]
  const signedDate = new Date(signature.signed_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  try {
    const resend = getResend()
    const { error: sendErr } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: client.email,
      subject: `Your signed consent form from ${shopName}`,
      text: [
        firstName ? `Hi ${firstName},` : 'Hi,',
        '',
        `Your signed copy of the ${shopName} consent form is attached as a PDF.`,
        `You signed it on ${signedDate}.`,
        '',
        'Keep it with your records. If anything looks off, contact the shop.',
      ].join('\n'),
      attachments: [{ filename: 'signed-consent-form.pdf', content: pdfBase64 }],
    })
    if (sendErr) throw sendErr
  } catch (err) {
    logger.error('consent_copy_email_failed', { message: (err as Error).message })
    return NextResponse.json(
      { error: 'Could not send the email. Try again in a moment.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, maskedEmail: maskEmail(client.email) })
}
