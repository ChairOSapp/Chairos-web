import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Shared write path for audit_events (RLS on that table has no INSERT
// policy for any client-facing role -- only this route, using the
// service role key, can write). Called fire-and-forget from dashboard
// pages right after a mutation succeeds. actor_user_id always comes
// from the verified session below, never from the request body, so a
// caller can't forge who performed an action -- and the shop_id is
// checked against real ownership so a caller can only log events for
// a shop they actually own.
export async function POST(req: NextRequest) {
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
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { shopId, action, entityType, entityId, metadata } = await req.json()
  if (!shopId || !action || !entityType) {
    return NextResponse.json({ error: 'shopId, action, and entityType are required' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: shop } = await admin.from('shops').select('id').eq('id', shopId).eq('owner_id', user.id).maybeSingle()
  if (!shop) {
    return NextResponse.json({ error: 'Not authorized for this shop' }, { status: 403 })
  }

  const { error } = await admin.from('audit_events').insert({
    shop_id: shopId,
    actor_user_id: user.id,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    metadata: metadata || null,
  })

  if (error) {
    logger.error('audit_event_insert_failed', { action, entityType, message: error.message })
    return NextResponse.json({ error: 'Could not record audit event' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
