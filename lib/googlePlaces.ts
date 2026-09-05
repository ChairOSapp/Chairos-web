import Anthropic from '@anthropic-ai/sdk'

export type PlaceCandidate = {
  id: string
  name: string
  address: string
  rating: number | null
  userRatingCount: number | null
}

const SHORT_LINK_HOSTS = ['maps.app.goo.gl', 'goo.gl']

function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim())
}

// Google Maps share links come in two shapes worth handling:
//  - a short link (maps.app.goo.gl/...) that 302s to the canonical URL below
//  - the canonical URL itself: .../maps/place/<Name>/@<lat>,<lng>,<zoom>/...
// Both cases put the business's display name directly in the path (as the
// "Share" flow generates it) and the coordinates in the @lat,lng segment,
// which is enough to run a reliable Text Search without ever needing the
// hex CID embedded further into the URL (Places API New has no by-CID
// lookup, only by-name search or by-place_id, and place_id isn't in the URL
// at all).
async function expandIfShortLink(url: string): Promise<string> {
  try {
    const host = new URL(url).host
    if (!SHORT_LINK_HOSTS.some(h => host === h || host.endsWith('.' + h))) return url
    const res = await fetch(url, { redirect: 'follow' })
    return res.url || url
  } catch {
    return url
  }
}

function extractFromMapsUrl(url: string): { query: string; lat?: number; lng?: number } | null {
  let name: string | null = null
  let lat: number | undefined
  let lng: number | undefined

  const placeMatch = url.match(/\/maps\/place\/([^/@?]+)/)
  if (placeMatch) {
    try {
      name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim()
    } catch {
      name = placeMatch[1].replace(/\+/g, ' ').trim()
    }
  }

  const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (coordMatch) {
    lat = parseFloat(coordMatch[1])
    lng = parseFloat(coordMatch[2])
  }

  // A bare search URL (maps/search/<query>) or a "?q=" param also carries
  // the query directly, without a /place/ segment.
  if (!name) {
    const searchMatch = url.match(/\/maps\/search\/([^/?]+)/)
    if (searchMatch) {
      try {
        name = decodeURIComponent(searchMatch[1].replace(/\+/g, ' ')).trim()
      } catch {
        name = searchMatch[1].replace(/\+/g, ' ').trim()
      }
    }
  }
  if (!name) {
    try {
      const q = new URL(url).searchParams.get('q')
      if (q) name = q.trim()
    } catch { /* not a parseable URL */ }
  }

  if (!name) return null
  return { query: name, lat, lng }
}

// Claude is used only as a last-resort text cleaner when deterministic URL
// parsing finds nothing usable -- it never picks the actual business, it
// just turns messy pasted input into a short search string that then goes
// through the real Google API like everything else.
async function cleanQueryWithAI(raw: string): Promise<string> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 60,
      system: `A shop owner pasted this into a "find my business on Google" box. It might be a mangled link, a business name with extra junk, or something else. Extract the most likely business name (and city/area if present) as a short plain-text search query -- nothing else, no explanation, no quotes. If you genuinely cannot extract anything meaningful, return the input completely unchanged.`,
      messages: [{ role: 'user', content: raw }],
    })
    const block = response.content[0] as Anthropic.TextBlock
    return block.text.trim() || raw
  } catch {
    return raw
  }
}

// Resolves whatever an owner pastes -- a full Maps URL, a maps.app.goo.gl
// short link, or a plain business name -- into a search query for Places
// API (New) Text Search. Deterministic URL parsing is tried first; Claude
// only steps in when that comes up empty.
export async function resolveToSearchQuery(rawInput: string): Promise<{ query: string; lat?: number; lng?: number }> {
  const input = rawInput.trim()

  if (looksLikeUrl(input)) {
    const expanded = await expandIfShortLink(input)
    const extracted = extractFromMapsUrl(expanded)
    if (extracted) return extracted
    // A URL we couldn't parse at all -- let Claude take a pass rather than
    // sending a raw, tracking-parameter-laden URL straight into Text Search.
    const cleaned = await cleanQueryWithAI(input)
    return { query: cleaned }
  }

  // Plain text. Only bother with Claude cleanup if it looks unusually messy
  // (very long, or full of symbols a business name wouldn't have) --
  // ordinary "Shop Name, City" input goes straight to Text Search.
  const looksMessy = input.length > 80 || /[<>{}|\\^~[\]]/.test(input)
  if (looksMessy) {
    const cleaned = await cleanQueryWithAI(input)
    return { query: cleaned }
  }
  return { query: input }
}

export async function searchPlaces(query: string, bias?: { lat: number; lng: number }): Promise<PlaceCandidate[]> {
  const body: any = { textQuery: query }
  if (bias) {
    body.locationBias = {
      circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 500 },
    }
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
    },
    body: JSON.stringify(body),
  })

  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error?.message || `Places API error (${res.status})`)
  }

  const places: any[] = data.places ?? []
  return places.slice(0, 5).map(p => ({
    id: p.id,
    name: p.displayName?.text ?? 'Unknown business',
    address: p.formattedAddress ?? '',
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
  }))
}
