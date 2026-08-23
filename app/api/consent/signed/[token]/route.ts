import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public route gated by the signature's own access_token (unguessable
// UUID), not RLS — the client that signed has no Supabase Auth identity to
// scope an RLS policy to, so this is their only path to "own signed copy".
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data: signature, error } = await supabase
    .from('consent_form_signatures')
    .select('signed_pdf_path, signed_at, shop_id, template_version')
    .eq('access_token', token)
    .maybeSingle()
  if (error || !signature) {
    return NextResponse.json({ error: 'Signed document not found' }, { status: 404 })
  }

  const { data: shop } = await supabase.from('shops').select('name').eq('id', signature.shop_id).maybeSingle()

  const { data: signedUrlData, error: signedUrlErr } = await supabase.storage
    .from('consent-signed')
    .createSignedUrl(signature.signed_pdf_path, 900)
  if (signedUrlErr || !signedUrlData) {
    return NextResponse.json({ error: 'Could not generate a link to the signed document' }, { status: 500 })
  }

  return NextResponse.json({
    signedUrl: signedUrlData.signedUrl,
    signedAt: signature.signed_at,
    templateVersion: signature.template_version,
    shopName: shop?.name || 'the shop',
  })
}
