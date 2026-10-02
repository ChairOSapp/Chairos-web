import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function authedClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Flyers live in a private bucket. Mint a short-lived signed URL per view;
// the GET route below already verified the caller is owner/active staff of
// the shop, so this is the authorization boundary (storage RLS is
// defense-in-depth). Returns null when the post has no photo or signing
// fails, in which case the UI simply shows no photo.
async function signImageUrl(admin: ReturnType<typeof adminClient>, imagePath: string | null): Promise<string | null> {
  if (!imagePath) return null
  const { data, error } = await admin.storage.from('announcement-images').createSignedUrl(imagePath, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

// Resolve the shop the signed-in user belongs to: their owned shop first,
// otherwise the shop where they are active staff. Returns null for outsiders.
async function resolveShop(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data: owned } = await admin.from('shops').select('id').eq('owner_id', userId).maybeSingle()
  if (owned) return { shopId: owned.id as string, isOwner: true }
  const { data: staffRow } = await admin
    .from('shop_barbers').select('shop_id')
    .eq('barber_id', userId).eq('active', true).maybeSingle()
  if (staffRow) return { shopId: staffRow.shop_id as string, isOwner: false }
  return null
}

// GET /api/announcements -- announcements for my shop, pinned first then newest.
// Rolling 30-day window: pinned posts always show; unpinned posts older than
// 30 days roll off the board (they stay in the DB).
export async function GET() {
  const cookieStore = await cookies()
  const supabase = authedClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminClient()
  const resolved = await resolveShop(admin, user.id)
  if (!resolved) return NextResponse.json({ error: 'No shop found' }, { status: 404 })

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from('shop_announcements')
    .select('id, title, body, pinned, author_name, created_at, image_url')
    .eq('shop_id', resolved.shopId)
    .or(`pinned.eq.true,created_at.gte.${cutoff}`)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: 'Could not load announcements' }, { status: 500 })
  const announcements = await Promise.all((data ?? []).map(async (a) => ({
    ...a,
    image_url: await signImageUrl(admin, a.image_url),
  })))
  return NextResponse.json({ announcements, isOwner: resolved.isOwner })
}

// POST /api/announcements -- owner-only: post an update to the shop board.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = authedClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminClient()
  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', user.id).maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Only the shop owner can post updates' }, { status: 403 })

  const { title, body, image_url } = await req.json().catch(() => ({}))
  const cleanTitle = String(title || '').trim()
  const cleanBody = String(body || '').trim()
  if (!cleanTitle || !cleanBody) {
    return NextResponse.json({ error: 'Add a title and a message first' }, { status: 400 })
  }
  if (cleanTitle.length > 120 || cleanBody.length > 2000) {
    return NextResponse.json({ error: 'Keep the title under 120 characters and the message under 2000' }, { status: 400 })
  }
  let cleanImage: string | null = null
  if (image_url) {
    cleanImage = String(image_url).trim()
    // Must be a storage path in this shop's own announcements folder, not an
    // arbitrary URL: "<shop_id>/announcements/<uuid>". The bucket is private
    // and the board serves photos via signed URLs, so a raw URL is never valid.
    const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/announcements\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(cleanImage)
    if (!m || m[1] !== shop.id || cleanImage.length > 200) {
      return NextResponse.json({ error: 'That photo upload looks invalid — try adding it again' }, { status: 400 })
    }
  }

  const { data: prof } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const { data: created, error } = await admin
    .from('shop_announcements')
    .insert({
      shop_id: shop.id,
      author_id: user.id,
      author_name: prof?.full_name || 'Owner',
      title: cleanTitle,
      body: cleanBody,
      image_url: cleanImage,
    })
    .select('id, title, body, pinned, author_name, created_at, image_url')
    .single()
  if (error) return NextResponse.json({ error: 'Could not post the update' }, { status: 500 })
  return NextResponse.json({
    announcement: { ...created, image_url: await signImageUrl(admin, created.image_url) },
  })
}
