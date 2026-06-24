import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const ADMIN_EMAILS = ['tbbryant07@gmail.com']

const PUBLIC_PATHS = ['/', '/login', '/signup', '/join', '/subscribe', '/api/stripe/webhook']

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true
  // Allow booking pages, auth callbacks, Square/Stripe API routes
  if (pathname.startsWith('/book/')) return true
  if (pathname.startsWith('/shop/')) return true
  if (pathname.startsWith('/api/stripe/')) return true
  if (pathname.startsWith('/api/square/')) return true
  if (pathname.startsWith('/api/sms')) return true
  if (pathname.startsWith('/_next/')) return true
  if (pathname.startsWith('/favicon')) return true
  return false
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in — redirect to login
  if (!user) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Admin routes — email allowlist only
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (!user.email || !ADMIN_EMAILS.includes(user.email)) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // Fetch billing status from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_end_date, grace_period_ends_at, stripe_customer_id, plan_type')
    .eq('id', user.id)
    .maybeSingle()

  const status = profile?.subscription_status
  const planType = profile?.plan_type

  // Shop barbers (plan_type='shop') are covered by their owner — always allow
  if (planType === 'shop') return res

  // No subscription info yet (just signed up) — allow through
  if (!status) return res

  // Active or trialing — allow through
  if (status === 'active' || status === 'trialing') return res

  // Past due or grace period — allow with paywall header
  if (status === 'past_due' || status === 'grace_period') {
    res.headers.set('x-show-paywall', '1')
    res.headers.set('x-billing-status', status)
    return res
  }

  // Cancelled — check if still within grace period access window
  if (status === 'cancelled') {
    const graceEnd = profile?.grace_period_ends_at || profile?.subscription_end_date
    if (graceEnd && new Date(graceEnd) > new Date()) {
      res.headers.set('x-show-paywall', '1')
      res.headers.set('x-billing-status', 'cancelled')
      return res
    }
    // Expired — redirect to subscribe
    const url = req.nextUrl.clone()
    url.pathname = '/subscribe'
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
