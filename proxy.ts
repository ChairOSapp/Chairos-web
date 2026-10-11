import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit, getClientIp, getRateLimitBucket } from '@/lib/rate-limit'
import { isAdminEmail } from '@/lib/admin'

const PUBLIC_PATHS = ['/', '/login', '/signup', '/join', '/subscribe', '/privacy', '/terms', '/sms-optout', '/forgot-password', '/reset-password', '/barbershops', '/salons', '/tattoo']

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (pathname.startsWith('/schools/')) return true
  if (pathname.startsWith('/book/')) return true
  if (pathname.startsWith('/kiosk/')) return true
  if (pathname === '/my' || pathname.startsWith('/my/')) return true
  if (pathname.startsWith('/api/portal/')) return true
  if (pathname.startsWith('/shop/')) return true
  if (pathname.startsWith('/consent/')) return true
  if (pathname.startsWith('/api/stripe/')) return true
  if (pathname.startsWith('/api/square/')) return true
  if (pathname.startsWith('/api/webhooks/')) return true
  if (pathname.startsWith('/api/sms')) return true
  if (pathname.startsWith('/api/voice')) return true
  if (pathname.startsWith('/api/email/')) return true
  if (pathname.startsWith('/api/consent/')) return true
  if (pathname.startsWith('/api/book/')) return true
  if (pathname.startsWith('/api/kiosk/')) return true
  if (pathname.startsWith('/api/waitlist')) return true
  if (pathname.startsWith('/_next/')) return true
  if (pathname.startsWith('/favicon')) return true
  if (pathname.startsWith('/landing/')) return true
  return false
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) {
    const bucket = getRateLimitBucket(pathname)
    if (bucket) {
      const ip = getClientIp(request)
      const result = await checkRateLimit(bucket, ip)
      if (!result.ok) {
        return NextResponse.json(
          { error: 'Too many requests, please try again shortly.' },
          { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
        )
      }
    }
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Auth cookies must stay readable by JavaScript: the browser client
      // (createBrowserClient in lib/supabase.ts) persists and restores the
      // session via document.cookie. Setting httpOnly here blinds it — after
      // the middleware's first token rotation the jar looks empty to the
      // client, so every app restart forces a fresh sign-in and the
      // refresh-race patch in lib/supabase.ts silently no-ops. httpOnly on
      // these cookies was security theater anyway: the SPA holds the full
      // session in JS memory regardless, so any XSS could exfiltrate via the
      // client itself without touching document.cookie. (Upstream
      // @supabase/ssr defaults to httpOnly: false for exactly this reason.)
      cookieOptions: { httpOnly: false, secure: true, sameSite: 'lax' },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in — redirect to login
  if (!user) {
    // API calls must get a JSON 401, never an HTML redirect: fetch follows
    // the redirect to /login, and res.json() on that HTML throws WebKit's
    // cryptic "The string did not match the expected pattern." instead of a
    // usable "session expired" message.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages
  if (pathname === '/login' || pathname === '/signup') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Admin routes — hardcoded founder allowlist only, regardless of role
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (!isAdminEmail(user.email)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Fetch billing status
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, trial_end, subscription_end_date, grace_period_ends_at, plan_type')
    .eq('id', user.id)
    .maybeSingle()

  const status = profile?.subscription_status
  const planType = profile?.plan_type

  // Shop barbers are covered by their owner — always allow
  if (planType === 'shop') return supabaseResponse

  // No subscription info yet (just signed up) — allow through
  if (!status) return supabaseResponse

  // Active or trialing (and trial not expired) — allow through
  if (status === 'active') return supabaseResponse
  if (status === 'trialing') {
    const trialExpired = profile?.trial_end && new Date(profile.trial_end) < new Date()
    if (!trialExpired) return supabaseResponse
    return NextResponse.redirect(new URL('/subscribe', request.url))
  }

  // Past due or grace period — allow with paywall header
  if (status === 'past_due' || status === 'grace_period') {
    supabaseResponse.headers.set('x-show-paywall', '1')
    supabaseResponse.headers.set('x-billing-status', status)
    return supabaseResponse
  }

  // Cancelled — check if still within grace window
  if (status === 'cancelled') {
    const graceEnd = profile?.grace_period_ends_at || profile?.subscription_end_date
    if (graceEnd && new Date(graceEnd) > new Date()) {
      supabaseResponse.headers.set('x-show-paywall', '1')
      supabaseResponse.headers.set('x-billing-status', 'cancelled')
      return supabaseResponse
    }
    return NextResponse.redirect(new URL('/subscribe', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
