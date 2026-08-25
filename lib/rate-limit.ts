import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// Vercel's "Upstash for Redis" marketplace integration names env vars
// either KV_REST_API_* (legacy Vercel KV naming) or UPSTASH_REDIS_REST_*
// depending on how it was connected -- support both. Until either pair is
// set, rate limiting fails open (allows the request) rather than blocking
// all public traffic on a misconfigured/missing integration.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const redis = url && token ? new Redis({ url, token }) : null

export type RateLimitBucket =
  | 'login'
  | 'bookApi'
  | 'squarePayment'
  | 'sms'
  | 'bookPage'
  | 'kioskCheckin'
  | 'kioskStatus'
  | 'waitlist'

const BUCKET_CONFIG: Record<RateLimitBucket, { limit: number; window: Parameters<typeof Ratelimit.slidingWindow>[1] }> = {
  login: { limit: 5, window: '60 s' },
  bookApi: { limit: 20, window: '60 s' },
  squarePayment: { limit: 10, window: '60 s' },
  sms: { limit: 10, window: '60 s' },
  bookPage: { limit: 60, window: '60 s' },
  kioskCheckin: { limit: 12, window: '60 s' },
  kioskStatus: { limit: 30, window: '60 s' },
  waitlist: { limit: 5, window: '60 s' },
}

const limiters = new Map<RateLimitBucket, Ratelimit>()

function getLimiter(bucket: RateLimitBucket): Ratelimit | null {
  if (!redis) return null
  let limiter = limiters.get(bucket)
  if (!limiter) {
    const { limit, window } = BUCKET_CONFIG[bucket]
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `chairos:ratelimit:${bucket}`,
      analytics: false,
    })
    limiters.set(bucket, limiter)
  }
  return limiter
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

export async function checkRateLimit(bucket: RateLimitBucket, identifier: string): Promise<RateLimitResult> {
  const limiter = getLimiter(bucket)
  if (!limiter) return { ok: true }
  const { success, reset } = await limiter.limit(identifier)
  if (success) return { ok: true }
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || '0.0.0.0'
}

// Ordered by specificity -- checked top to bottom, first match wins.
export function getRateLimitBucket(pathname: string): RateLimitBucket | null {
  if (pathname === '/login') return 'login'
  if (pathname.startsWith('/api/kiosk/checkin')) return 'kioskCheckin'
  if (pathname.startsWith('/api/kiosk/status')) return 'kioskStatus'
  if (pathname.startsWith('/api/waitlist')) return 'waitlist'
  if (
    pathname.startsWith('/api/square/save-card') ||
    pathname.startsWith('/api/square/create-deposit') ||
    pathname.startsWith('/api/square/create-payment')
  ) return 'squarePayment'
  if (pathname.startsWith('/api/sms')) return 'sms'
  if (pathname.startsWith('/api/book/')) return 'bookApi'
  if (pathname.startsWith('/book/')) return 'bookPage'
  return null
}
