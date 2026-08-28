import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateReviewResponseDraft } from '@/lib/reviewResponseAI'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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

async function getOwnedReview(userId: string, reviewId: string) {
  const admin = getAdminSupabase()
  const { data: shop } = await admin.from('shops').select('id, name, vertical').eq('owner_id', userId).limit(1).maybeSingle()
  if (!shop) return null
  const { data: review } = await admin.from('reviews').select('*').eq('id', reviewId).eq('shop_id', shop.id).maybeSingle()
  if (!review) return null
  return { shop, review }
}

// Generate (or regenerate) a draft response for a review.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const owned = await getOwnedReview(user.id, id)
  if (!owned) return NextResponse.json({ error: 'Review not found or not owned by this shop' }, { status: 404 })
  const { shop, review } = owned

  const admin = getAdminSupabase()
  let staffName: string | null = null
  if (review.barber_id) {
    const { data: staff } = await admin.from('shop_barbers').select('barber_name, alias').eq('shop_id', shop.id).eq('barber_id', review.barber_id).maybeSingle()
    staffName = staff?.barber_name || staff?.alias || null
  }

  let draftText: string
  try {
    draftText = await generateReviewResponseDraft({
      shopName: shop.name,
      vertical: shop.vertical,
      reviewerName: review.reviewer_name,
      rating: review.rating,
      body: review.body,
      staffName,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to generate draft', detail: err.message }, { status: 500 })
  }

  const { data: saved, error: upsertErr } = await admin
    .from('review_responses')
    .upsert({
      review_id: review.id,
      shop_id: shop.id,
      draft_text: draftText,
      edited_text: null,
      status: 'pending',
      ai_generated: true,
      generated_at: new Date().toISOString(),
      approved_at: null,
      posted_at: null,
      dismissed_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'review_id' })
    .select()
    .single()

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  return NextResponse.json({ response: saved })
}

// Edit the draft and/or move it through its review lifecycle.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const owned = await getOwnedReview(user.id, id)
  if (!owned) return NextResponse.json({ error: 'Review not found or not owned by this shop' }, { status: 404 })

  let body: { edited_text?: string; status?: 'pending' | 'approved' | 'posted' | 'dismissed' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const VALID_STATUSES = ['pending', 'approved', 'posted', 'dismissed']
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.edited_text !== undefined) updates.edited_text = body.edited_text
  if (body.status) {
    updates.status = body.status
    if (body.status === 'approved') updates.approved_at = new Date().toISOString()
    if (body.status === 'posted') updates.posted_at = new Date().toISOString()
    if (body.status === 'dismissed') updates.dismissed_at = new Date().toISOString()
  }

  const admin = getAdminSupabase()
  const { data: updated, error } = await admin
    .from('review_responses')
    .update(updates)
    .eq('review_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ response: updated })
}
