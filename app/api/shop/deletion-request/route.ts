import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getUserId() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// POST /api/shop/deletion-request
// { shopId, reason? } — Owner requests full account deletion.
export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { shopId, reason } = await req.json().catch(() => ({}))
  if (!shopId) return NextResponse.json({ error: 'shopId is required' }, { status: 400 })

  const admin = getAdmin()

  // Verify ownership
  const { data: shop } = await admin
    .from('shops')
    .select('id, name')
    .eq('id', shopId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (!shop) return NextResponse.json({ error: 'Shop not found or not yours' }, { status: 404 })

  // Check for existing pending request
  const { data: existing } = await admin
    .from('deletion_requests')
    .select('id')
    .eq('shop_id', shopId)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'A deletion request is already pending for this shop' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('deletion_requests')
    .insert({
      shop_id: shopId,
      requested_by: userId,
      reason: reason?.slice(0, 1000) || null,
      status: 'pending',
    })
    .select('id, requested_at')
    .single()

  if (error) return NextResponse.json({ error: 'Could not create deletion request' }, { status: 500 })

  return NextResponse.json({
    ok: true,
    requestId: data.id,
    message: 'Deletion request received. We\'ll complete it within 30 days and confirm by email.',
  })
}

// GET /api/shop/deletion-request?shopId=...
// Check status of pending request.
export async function GET(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const shopId = searchParams.get('shopId')
  if (!shopId) return NextResponse.json({ error: 'shopId is required' }, { status: 400 })

  const admin = getAdmin()
  const { data } = await admin
    .from('deletion_requests')
    .select('id, status, requested_at, completed_at')
    .eq('shop_id', shopId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ request: data || null })
}
