import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Logo/hero uploads used to go straight from the browser to Supabase Storage
// with the client's own session token. That token can go stale (backgrounded
// mobile tab, long-idle session) in ways the browser client doesn't always
// recover from before firing the request, which surfaced to owners as an
// opaque "new row violates row-level security policy" instead of an upload
// actually happening. Routing through a server route sidesteps that class of
// bug entirely: ownership is verified once via the request's cookies, then
// the actual write uses the service role key, which isn't subject to the
// browser session's freshness at all.

const MAX_BYTES: Record<string, number> = { logo: 2 * 1024 * 1024, hero: 5 * 1024 * 1024, announcement: 5 * 1024 * 1024 }
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const BUCKET: Record<string, string> = { logo: 'shop-assets', hero: 'shop-assets', announcement: 'announcement-images' }

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Your session has expired. Please refresh the page and log in again.' }, { status: 401 })

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file')
  const kind = formData?.get('kind')
  if (!(file instanceof File) || (kind !== 'logo' && kind !== 'hero' && kind !== 'announcement')) {
    return NextResponse.json({ error: 'Missing file or kind' }, { status: 400 })
  }

  const maxBytes = MAX_BYTES[kind]
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)}MB` }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported image type. Use JPG, PNG, WEBP, or GIF.' }, { status: 400 })
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'No shop found for this account.' }, { status: 404 })

  const bucket = BUCKET[kind as string]
  // Announcements get a unique path per upload (a post can be deleted and
  // re-posted); logo/hero keep their stable single-file paths.
  const path = kind === 'announcement'
    ? `${shop.id}/announcements/${crypto.randomUUID()}`
    : `${shop.id}/${kind}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await admin.storage.from(bucket).upload(path, buffer, {
    upsert: true,
    contentType: file.type,
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Announcements live in a private bucket: hand back the storage path (what
  // gets stored on the post) plus a short-lived signed URL for the compose
  // preview. The board's GET route mints fresh signed URLs per view, so no
  // public URL for flyers ever exists.
  if (kind === 'announcement') {
    const { data: signed, error: signError } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60)
    if (signError || !signed?.signedUrl) return NextResponse.json({ error: 'Could not prepare photo preview' }, { status: 500 })
    return NextResponse.json({ url: signed.signedUrl, path })
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path)
  const url = `${pub.publicUrl}?t=${Date.now()}`

  // Logo/hero persist onto the shop row (announcements return early above).
  {
    const column = kind === 'logo' ? 'logo_url' : 'hero_url'
    const { error: updateError } = await admin.from('shops').update({ [column]: url }).eq('id', shop.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ url })
}
