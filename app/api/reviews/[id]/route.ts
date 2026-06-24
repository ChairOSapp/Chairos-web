import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAuthenticatedUser(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  return user
}

async function getOwnerShop(userId: string) {
  const { data: shop, error } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle()
  if (error || !shop) return null
  return shop
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<'/api/reviews/[id]'>
) {
  const user = await getAuthenticatedUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shop = await getOwnerShop(user.id)
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  const { id } = await ctx.params

  let body: { visible?: boolean; barber_id?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.visible !== undefined) updates.visible = body.visible
  if ('barber_id' in body) updates.barber_id = body.barber_id ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data: review, error: updateErr } = await supabase
    .from('reviews')
    .update(updates)
    .eq('id', id)
    .eq('shop_id', shop.id)
    .select()
    .single()

  if (updateErr || !review) {
    return NextResponse.json({ error: 'Review not found or not owned by this shop' }, { status: 404 })
  }

  return NextResponse.json({ review })
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<'/api/reviews/[id]'>
) {
  const user = await getAuthenticatedUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shop = await getOwnerShop(user.id)
  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  const { id } = await ctx.params

  const { data: deleted, error: deleteErr } = await supabase
    .from('reviews')
    .delete()
    .eq('id', id)
    .eq('shop_id', shop.id)
    .select('id')

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Review not found or not owned by this shop' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
