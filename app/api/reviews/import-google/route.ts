import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  const { place_id } = body
  if (!place_id) {
    return NextResponse.json({ error: 'place_id is required' }, { status: 400 })
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

  // Call Google Places API
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', place_id)
  url.searchParams.set('fields', 'reviews,rating,user_ratings_total')
  url.searchParams.set('key', process.env.GOOGLE_PLACES_API_KEY!)

  let placesData: any
  try {
    const placesRes = await fetch(url.toString())
    placesData = await placesRes.json()
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to reach Google Places API' }, { status: 502 })
  }

  if (placesData.status !== 'OK') {
    return NextResponse.json(
      { error: `Google Places API error: ${placesData.status}`, detail: placesData.error_message },
      { status: 502 }
    )
  }

  const googleReviews: any[] = placesData.result?.reviews ?? []

  if (googleReviews.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0 })
  }

  const rows = googleReviews.map((review: any) => ({
    shop_id: shop.id,
    barber_id: null,
    source: 'google',
    reviewer_name: review.author_name,
    rating: review.rating,
    body: review.text,
    review_date: new Date(review.time * 1000).toISOString().split('T')[0],
    visible: true,
  }))

  const { data: upserted, error: upsertErr } = await supabase
    .from('reviews')
    .upsert(rows, { onConflict: 'shop_id,reviewer_name,review_date', ignoreDuplicates: true })
    .select('id')

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  const imported = upserted?.length ?? 0
  const skipped = rows.length - imported

  return NextResponse.json({ imported, skipped })
}
