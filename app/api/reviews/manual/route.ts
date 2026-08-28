import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateReviewResponseDraft } from '@/lib/reviewResponseAI'

const VALID_SOURCES = ['google', 'booksy', 'manual', 'chairos'] as const

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    reviewer_name?: string
    rating?: number
    body?: string
    review_date?: string
    source?: string
    barber_id?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { reviewer_name, rating, body: reviewBody, review_date, source, barber_id } = body

  if (!reviewer_name) {
    return NextResponse.json({ error: 'reviewer_name is required' }, { status: 400 })
  }
  if (rating === undefined || rating === null) {
    return NextResponse.json({ error: 'rating is required' }, { status: 400 })
  }
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 })
  }
  if (!source || !(VALID_SOURCES as readonly string[]).includes(source)) {
    return NextResponse.json(
      { error: `source must be one of: ${VALID_SOURCES.join(', ')}` },
      { status: 400 }
    )
  }

  // Get owner's shop
  const { data: shop, error: shopErr } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1)
    .maybeSingle()

  if (shopErr || !shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  if (barber_id) {
    const { data: staff } = await supabase
      .from('shop_barbers')
      .select('id')
      .eq('shop_id', shop.id)
      .eq('barber_id', barber_id)
      .maybeSingle()
    if (!staff) {
      return NextResponse.json({ error: 'barber_id is not staff at this shop' }, { status: 400 })
    }
  }

  const { data: review, error: insertErr } = await supabase
    .from('reviews')
    .insert({
      shop_id: shop.id,
      reviewer_name,
      rating,
      body: reviewBody ?? null,
      review_date: review_date ?? null,
      source,
      barber_id: barber_id || null,
      visible: true,
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Best-effort draft response generation — a review is still saved even if this fails.
  try {
    const { data: shopDetails } = await supabase.from('shops').select('name, vertical').eq('id', shop.id).maybeSingle()
    let staffName: string | null = null
    if (barber_id) {
      const { data: staff } = await supabase.from('shop_barbers').select('barber_name, alias').eq('shop_id', shop.id).eq('barber_id', barber_id).maybeSingle()
      staffName = staff?.barber_name || staff?.alias || null
    }
    const draftText = await generateReviewResponseDraft({
      shopName: shopDetails?.name ?? 'the shop',
      vertical: shopDetails?.vertical ?? null,
      reviewerName: review.reviewer_name,
      rating: review.rating,
      body: review.body,
      staffName,
    })
    await supabase.from('review_responses').insert({
      review_id: review.id,
      shop_id: shop.id,
      draft_text: draftText,
      status: 'pending',
      ai_generated: true,
    })
  } catch {
    // Draft generation is a convenience, not a requirement for saving the review.
  }

  return NextResponse.json({ review })
}
