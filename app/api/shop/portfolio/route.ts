import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getManagedShop } from '@/lib/shopMembers'
import { randomUUID } from 'crypto'

// Portfolio photos for a shop. Uploads go through this server route (service
// role) rather than direct browser-to-storage so a stale mobile session can't
// surface as an opaque RLS error — same pattern as /api/shop/upload-asset.

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function getClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return {
    admin: createAdmin(url, process.env.SUPABASE_SERVICE_ROLE_KEY!),
  }
}

async function requireManager() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please refresh the page and log in again.' as const }
  const { admin } = getClients()
  const shop = await getManagedShop(admin, user.id)
  if (!shop) return { error: 'No shop found for this account.' as const }
  return { user, shop, admin }
}

// GET — list this manager's shop portfolio photos, ordered for display.
export async function GET() {
  const ctx = await requireManager()
  if ('error' in ctx) {
    const errMsg: string = ctx.error ?? 'Unknown error'
    const status = errMsg.includes('session') ? 401 : 404
    return NextResponse.json({ error: errMsg }, { status })
  }

  const { data, error } = await ctx.admin
    .from('portfolio_photos')
    .select('id, shop_id, barber_id, photo_url, caption, sort_order, created_at')
    .eq('shop_id', ctx.shop.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ photos: data ?? [], shop: { id: ctx.shop.id, name: ctx.shop.name } })
}

// POST — upload a portfolio photo (multipart: file, caption?, barber_id?).
export async function POST(req: NextRequest) {
  const ctx = await requireManager()
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 401 })

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file')
  const caption = (formData?.get('caption') as string | null)?.trim() || null
  const barberId = (formData?.get('barber_id') as string | null)?.trim() || null
  if (!(file instanceof File)) return NextResponse.json({ error: 'No image file provided.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large. Maximum size is 10MB.' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported image type. Use JPG, PNG, WEBP, or GIF.' }, { status: 400 })
  }

  const ext = file.type.split('/')[1] || 'jpg'
  const path = `${ctx.shop.id}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await ctx.admin.storage.from('portfolio').upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: pub } = ctx.admin.storage.from('portfolio').getPublicUrl(path)

  // Append at the end of the current order.
  const { data: maxRow } = await ctx.admin
    .from('portfolio_photos')
    .select('sort_order')
    .eq('shop_id', ctx.shop.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: photo, error: insertError } = await ctx.admin
    .from('portfolio_photos')
    .insert({
      shop_id: ctx.shop.id,
      barber_id: barberId,
      photo_url: pub.publicUrl,
      caption,
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select('id, shop_id, barber_id, photo_url, caption, sort_order, created_at')
    .single()
  if (insertError) {
    // Roll back the orphaned file.
    await ctx.admin.storage.from('portfolio').remove([path])
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }
  return NextResponse.json({ photo })
}
