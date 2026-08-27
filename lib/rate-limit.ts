import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { logger } from '@/lib/logger'

// Vercel's "Upstash for Redis" marketplace integration names env vars
// either KV_REST_API_* (legacy Vercel KV naming) or UPSTASH_REDIS_REST_*
// depending on how it was connected -- support both.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const redis = url && token ? new Redis({ url, token }) : null

if (!redis) {
  logger.error('rate_limit_redis_not_configured', {
    reason: 'Neither KV_REST_API_URL/TOKEN nor UPSTASH_REDIS_REST_URL/TOKEN is set -- security-sensitive buckets (failClosed: true) will block all traffic until this is fixed.',
  })
}

export type RateLimitBucket =
  | 'login'
  | 'bookApi'
  | 'squarePayment'
  | 'sms'
  | 'bookPage'
  | 'kioskCheckin'
  | 'kioskStatus'
  | 'waitlist'

// failClosed controls what happens when Redis is unreachable or not
// configured at all: true means the request is blocked (safer default for
// endpoints that gate account access or let one physical device spam
// writes); false means the request is allowed through (availability over
// strictness, for buckets where blocking real users on a Redis blip would
// be worse than a temporarily-unprotected window).
const BUCKET_CONFIG: Record<RateLimitBucket, { limit: number; window: Parameters<typeof Ratelimit.slidingWindow>[1]; failClosed: boolean }> = {
  login: { limit: 5, window: '60 s', failClosed: true },
  bookApi: { limit: 20, window: '60 s', failClosed: false },
  squarePayment: { limit: 10, window: '60 s', failClosed: false },
  sms: { limit: 10, window: '60 s', failClosed: false },
  bookPage: { limit: 60, window: '60 s', failClosed: false },
  kioskCheckin: { limit: 12, window: '60 s', failClosed: true },
  kioskStatus: { limit: 30, window: '60 s', failClosed: false },
  waitlist: { limit: 5, window: '60 s', failClosed: false },
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

const REDIS_DOWN_RESULT: RateLimitResult = { ok: false, retryAfterSeconds: 30 }

export async function checkRateLimit(bucket: RateLimitBucket, identifier: string): Promise<RateLimitResult> {
  const { failClosed } = BUCKET_CONFIG[bucket]
  const limiter = getLimiter(bucket)

  // Redis not configured at all (missing env vars).
  if (!limiter) return failClosed ? REDIS_DOWN_RESULT : { ok: true }

  try {
    const { success, reset } = await limiter.limit(identifier)
    if (success) return { ok: true }
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) }
  } catch (err) {
    // Redis configured but unreachable at request time (network blip,
    // instance down, etc). A misconfigured/unavailable Redis should
    // degrade to the bucket's configured failure mode, not silently
    // grant unlimited access to a security-sensitive endpoint.
    logger.error('rate_limit_check_failed', {
      bucket,
      message: err instanceof Error ? err.message : String(err),
    })
    return failClosed ? REDIS_DOWN_RESULT : { ok: true }
  }
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
