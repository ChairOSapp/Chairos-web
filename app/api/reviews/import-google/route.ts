import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateReviewResponseDraft } from '@/lib/reviewResponseAI'

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

  let body: { place_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Get owner's shop (include google_place_id as fallback)
  const { data: shop, error: shopErr } = await supabase
    .from('shops')
    .select('id, name, vertical, google_place_id')
    .eq('owner_id', user.id)
    .limit(1)
    .maybeSingle()

  if (shopErr || !shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
  }

  // Use provided place_id or fall back to the one saved in shop settings
  const resolvedPlaceId = body.place_id?.trim() || shop.google_place_id
  if (!resolvedPlaceId) {
    return NextResponse.json({ error: 'place_id is required. Save your Google Place ID in Shop Settings or provide it here.' }, { status: 400 })
  }

  // Call Places API (New) -- the legacy Places API
  // (maps.googleapis.com/maps/api/place/details/json) this route used to
  // call returns REQUEST_DENIED for this project's key ("This API key is
  // not authorized to use this service or API"), confirmed directly
  // against Google's endpoint: only Places API (New) is enabled here.
  // New API auth/fields work differently -- API key and field mask go in
  // headers, not query params, and there's no top-level "status" field to
  // check; a non-2xx response is the failure signal instead.
  let placesRes: Response
  try {
    placesRes = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(resolvedPlaceId)}`, {
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': 'id,rating,userRatingCount,reviews',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to reach Google Places API' }, { status: 502 })
  }

  const placesData: any = await placesRes.json()

  if (!placesRes.ok) {
    return NextResponse.json(
      { error: `Google Places API error: ${placesData.error?.status ?? placesRes.status}`, detail: placesData.error?.message },
      { status: 502 }
    )
  }

  const googleReviews: any[] = placesData.reviews ?? []

  if (googleReviews.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0 })
  }

  const rows = googleReviews.map((review: any) => ({
    shop_id: shop.id,
    barber_id: null,
    source: 'google',
    reviewer_name: review.authorAttribution?.displayName ?? 'Google User',
    rating: review.rating,
    body: review.text?.text ?? '',
    review_date: review.publishTime.split('T')[0],
    visible: true,
  }))

  const { data: upserted, error: upsertErr } = await supabase
    .from('reviews')
    .upsert(rows, { onConflict: 'shop_id,reviewer_name,review_date', ignoreDuplicates: true })
    .select('id, reviewer_name, rating, body, barber_id')

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  const imported = upserted?.length ?? 0
  const skipped = rows.length - imported

  // Best-effort draft response generation for each newly-imported review only
  // (ignoreDuplicates means `upserted` already excludes rows that already existed).
  for (const review of upserted ?? []) {
    try {
      const draftText = await generateReviewResponseDraft({
        shopName: shop.name,
        vertical: shop.vertical,
        reviewerName: review.reviewer_name,
        rating: review.rating,
        body: review.body,
      })
      await supabase.from('review_responses').insert({
        review_id: review.id,
        shop_id: shop.id,
        draft_text: draftText,
        status: 'pending',
        ai_generated: true,
      })
    } catch {
      // Draft generation is a convenience, not a requirement for the import to succeed.
    }
  }

  return NextResponse.json({ imported, skipped })
}
