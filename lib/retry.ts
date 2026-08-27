import { logger } from '@/lib/logger'

// Basic exponential backoff for direct external API calls made from Next.js
// API routes (Twilio/Square/Stripe) that have no Trigger.dev job wrapping
// them and therefore no retry safety net at all. 3 attempts, 1s/2s/4s
// between them. Not for use inside Trigger.dev jobs -- those already get
// retried by the platform; wrapping them here would double the backoff.
export async function withRetry<T>(
  event: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number }
): Promise<T> {
  const attempts = opts?.attempts ?? 3
  const baseDelayMs = opts?.baseDelayMs ?? 1000

  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const message = err instanceof Error ? err.message : String(err)
      if (attempt === attempts) {
        logger.error(`${event}_failed_final`, { attempt, attempts, message })
        break
      }
      logger.warn(`${event}_retry`, { attempt, attempts, message })
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)))
    }
  }
  throw lastErr
}
