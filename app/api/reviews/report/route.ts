import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/reviews/report -- anonymous flag on a public review
// (App Store Guideline 1.2: users need a way to flag objectionable
// user-generated content). Records the report in app_feedback for the
// platform record and notifies the shop owner, who can hide or delete
// the review from their dashboard. The review itself stays up until
// the owner acts — a report is a flag, not a takedown.
export async function POST(req: NextRequest) {
  let body: { reviewId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const reviewId = String(body.reviewId || '')
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) {
    return NextResponse.json({ error: 'reviewId is required' }, { status: 400 })
  }

  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  const limit = await checkRateLimit('reviewReport', `report:${ip}`)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many reports. Try again in a minute.' }, { status: 429 })
  }

  const admin = getAdmin()
  const { data: review } = await admin
    .from('reviews')
    .select('id, shop_id, rating, body, reviewer_name, visible')
    .eq('id', reviewId)
    .maybeSingle()

  // Unknown or already-hidden review: accept quietly so the endpoint
  // does not leak which review ids exist or their moderation state.
  if (!review || review.visible === false) {
    return NextResponse.json({ ok: true })
  }

  const excerpt = String(review.body || '').slice(0, 200)

  const { error: fbErr } = await admin.from('app_feedback').insert({
    user_id: null,
    email: null,
    category: 'review_report',
    message: `Public review reported. review_id=${review.id} shop_id=${review.shop_id} rating=${review.rating ?? ''} reviewer=${review.reviewer_name || 'Anonymous'} text="${excerpt}"`,
  })
  if (fbErr) {
    logger.error('review_report_feedback_failed', { reviewId: review.id, message: fbErr.message })
  }

  const { data: shop } = await admin
    .from('shops')
    .select('owner_id')
    .eq('id', review.shop_id)
    .maybeSingle()
  if (shop?.owner_id) {
    await admin.from('notifications').insert({
      user_id: shop.owner_id,
      shop_id: review.shop_id,
      type: 'review_report',
      title: 'A review was reported',
      body: excerpt
        ? `A visitor flagged this review: "${excerpt}" You can hide or delete it from Reviews.`
        : 'A visitor flagged one of your reviews. You can hide or delete it from Reviews.',
      link: '/dashboard/reviews',
      read: false,
    })
  }

  logger.info('review_reported', { reviewId: review.id, shopId: review.shop_id })
  return NextResponse.json({ ok: true })
}
