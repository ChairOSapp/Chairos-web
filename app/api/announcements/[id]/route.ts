import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function ownerShopId(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data: shop } = await admin.from('shops').select('id').eq('owner_id', userId).maybeSingle()
  return shop?.id as string | undefined
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

// PATCH /api/announcements/[id] -- owner-only: pin or unpin.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = adminClient()
  const shopId = await ownerShopId(admin, user.id)
  if (!shopId) return NextResponse.json({ error: 'Only the shop owner can pin updates' }, { status: 403 })

  const { id } = await params
  const { pinned } = await req.json().catch(() => ({}))
  const { data, error } = await admin
    .from('shop_announcements')
    .update({ pinned: !!pinned })
    .eq('id', id)
    .eq('shop_id', shopId)
    .select('id, pinned')
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Update not found' }, { status: 404 })
  return NextResponse.json({ announcement: data })
}

// DELETE /api/announcements/[id] -- owner-only: remove a post.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = adminClient()
  const shopId = await ownerShopId(admin, user.id)
  if (!shopId) return NextResponse.json({ error: 'Only the shop owner can delete updates' }, { status: 403 })

  const { id } = await params
  const { data: existing } = await admin
    .from('shop_announcements')
    .select('image_url')
    .eq('id', id)
    .eq('shop_id', shopId)
    .maybeSingle()

  const { data, error } = await admin
    .from('shop_announcements')
    .delete()
    .eq('id', id)
    .eq('shop_id', shopId)
    .select('id')
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Update not found' }, { status: 404 })

  // Best-effort: remove the flyer from the private bucket so deleted posts
  // don't orphan files. A storage failure must not fail the delete itself.
  if (existing?.image_url) {
    await admin.storage.from('announcement-images').remove([existing.image_url]).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
