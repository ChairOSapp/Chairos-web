import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveToSearchQuery, searchPlaces } from '@/lib/googlePlaces'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Your session has expired. Please refresh the page and log in again.' }, { status: 401 })
  }

  let body: { query?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const raw = body.query?.trim()
  if (!raw) {
    return NextResponse.json({ error: 'Paste a Google Maps link or your shop name.' }, { status: 400 })
  }

  try {
    const { query, lat, lng } = await resolveToSearchQuery(raw)
    const candidates = await searchPlaces(query, lat && lng ? { lat, lng } : undefined)

    if (candidates.length === 0) {
      return NextResponse.json({ error: "We couldn't find a match for that. Try pasting your Google Maps link instead, or use the advanced option below." }, { status: 404 })
    }

    return NextResponse.json({ candidates })
  } catch (err: any) {
    console.error('resolve-place failed:', err)
    return NextResponse.json({ error: "We couldn't reach Google to search for your business. Try again in a moment." }, { status: 502 })
  }
}
