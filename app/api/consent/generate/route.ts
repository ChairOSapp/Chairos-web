import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import {
  STATES, TATTOO_RULES, buildConsentSections,
  type Vertical, type BuilderOptions,
} from '@/lib/consent/rules'
import { generateConsentPdf } from '@/lib/consent/generatePdf'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getRequestUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

const VALID_VERTICALS: Vertical[] = ['tattoo', 'barber', 'salon']

// POST /api/consent/generate — shop owner builds a state-law-aware consent
// form. Generates the PDF server-side, stores it as a new active template
// version (same versioning as manual uploads), and returns the version.
export async function POST(req: NextRequest) {
  const user = await getRequestUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const stateCode = typeof body?.stateCode === 'string' ? body.stateCode.toUpperCase() : ''
  const vertical = body?.vertical as Vertical | undefined
  const rawOpts = body?.options ?? {}

  if (!STATES.some(s => s.code === stateCode)) {
    return NextResponse.json({ error: 'Valid stateCode is required' }, { status: 400 })
  }
  if (!VALID_VERTICALS.includes(vertical as Vertical)) {
    return NextResponse.json({ error: 'vertical must be tattoo, barber, or salon' }, { status: 400 })
  }
  if (vertical === 'tattoo' && !TATTOO_RULES[stateCode]) {
    return NextResponse.json({ error: 'No tattoo rules for this state yet' }, { status: 400 })
  }

  const options: BuilderOptions = {
    photoRelease: rawOpts.photoRelease === true,
    chemicalServices: rawOpts.chemicalServices === true,
    straightRazor: rawOpts.straightRazor === true,
  }

  const supabase = getServiceSupabase()

  // Owner check: the caller must own a shop.
  const { data: shops } = await supabase
    .from('shops')
    .select('id, name')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
  const shop = shops?.[0]
  if (!shop) {
    return NextResponse.json({ error: 'No shop found for this account' }, { status: 403 })
  }

  const sections = buildConsentSections(stateCode, vertical as Vertical, options)
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await generateConsentPdf({
      shopName: shop.name || 'Consent Form',
      stateCode,
      vertical: vertical as Vertical,
      sections,
    })
  } catch (e) {
    console.error('consent generate: pdf render failed', e)
    return NextResponse.json({ error: 'Could not render the consent form PDF' }, { status: 500 })
  }

  const { data: latest } = await supabase
    .from('consent_form_templates')
    .select('version')
    .eq('shop_id', shop.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = (latest?.version || 0) + 1
  const path = `${shop.id}/${nextVersion}-${randomUUID()}-builder.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('consent-templates')
    .upload(path, Buffer.from(pdfBytes), { contentType: 'application/pdf' })
  if (uploadErr) {
    console.error('consent generate: storage upload failed', uploadErr)
    return NextResponse.json({ error: 'Could not store the generated form' }, { status: 500 })
  }

  const templateId = randomUUID()
  const { error: insertErr } = await supabase.from('consent_form_templates').insert({
    id: templateId,
    shop_id: shop.id,
    vertical: vertical as Vertical,
    file_path: path,
    version: nextVersion,
    is_active: true,
  })
  if (insertErr) {
    console.error('consent generate: template insert failed', insertErr)
    return NextResponse.json({ error: 'Could not save the generated form' }, { status: 500 })
  }

  // Only one active template per shop — same pattern as manual uploads.
  await supabase.from('consent_form_templates')
    .update({ is_active: false })
    .eq('shop_id', shop.id)
    .neq('version', nextVersion)

  return NextResponse.json({
    ok: true,
    templateId,
    version: nextVersion,
    stateCode,
    vertical,
  })
}
