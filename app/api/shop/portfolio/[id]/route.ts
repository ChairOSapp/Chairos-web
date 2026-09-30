import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getShopRole } from '@/lib/shopMembers'

async function requirePhotoManager(photoId: string) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please refresh the page and log in again.', status: 401 } as const

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: photo } = await admin
    .from('portfolio_photos')
    .select('id, shop_id, photo_url')
    .eq('id', photoId)
    .maybeSingle()
  if (!photo) return { error: 'Photo not found.', status: 404 } as const

  const role = await getShopRole(admin, photo.shop_id, user.id)
  if (role !== 'owner' && role !== 'admin') {
    return { error: 'Only shop owners and admins can manage the portfolio.', status: 403 } as const
  }
  return { user, admin, photo }
}

// PATCH — update caption and/or sort_order.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePhotoManager(id)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const body = await req.json().catch(() => null)
  const updates: { caption?: string | null; sort_order?: number } = {}
  if (typeof body?.caption === 'string') updates.caption = body.caption.trim() || null
  if (typeof body?.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    updates.sort_order = Math.round(body.sort_order)
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await ctx.admin
    .from('portfolio_photos')
    .update(updates)
    .eq('id', id)
    .select('id, shop_id, barber_id, photo_url, caption, sort_order, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ photo: data })
}

// DELETE — remove the photo record and its storage object.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePhotoManager(id)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  // Derive the storage path from the public URL.
  const match = ctx.photo.photo_url.match(/\/portfolio\/(.+)$/)
  const storagePath = match ? match[1].split('?')[0] : null

  const { error: dbError } = await ctx.admin.from('portfolio_photos').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  if (storagePath) {
    await ctx.admin.storage.from('portfolio').remove([storagePath])
  }
  return NextResponse.json({ ok: true })
}
