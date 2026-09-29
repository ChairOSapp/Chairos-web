import { createClient } from '@supabase/supabase-js'
import { createSign } from 'node:crypto'
import { logger } from '@/lib/logger'

const APNS_BUNDLE_ID = 'cc.chairos.app'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function apnsConfigured(): boolean {
  return !!(
    process.env.APNS_TEAM_ID &&
    process.env.APNS_KEY_ID &&
    process.env.APNS_KEY
  )
}

// APNs token-based auth: ES256 JWT signed with the .p8 key, hand-rolled on
// node:crypto so we add zero dependencies. Valid up to 60 minutes; we mint
// one per send batch, which is well within limits.
function buildApnsJwt(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID! })
  ).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: process.env.APNS_TEAM_ID!,
      iat: Math.floor(Date.now() / 1000),
    })
  ).toString('base64url')
  // The .p8 from Apple is PKCS#8 PEM; env may carry literal \n escapes,
  // \r\n line endings, or stray whitespace from the Vercel dashboard.
  const key = process.env
    .APNS_KEY!.replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
  const signer = createSign('sha256')
  signer.update(`${header}.${payload}`)
  return `${header}.${payload}.${signer.sign(key, 'base64url')}`
}

function apnsHost(): string {
  return process.env.APNS_USE_SANDBOX === 'true'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com'
}

import { connect, type ClientHttp2Session } from 'node:http2'

// APNs requires HTTP/2 — Node's fetch (HTTP/1.1) gets its connection dropped.
// We keep one H2 session per host and reuse it across sends in the same lambda.
let h2Session: ClientHttp2Session | null = null
let h2SessionHost = ''

function getH2Session(host: string): ClientHttp2Session {
  if (h2Session && h2SessionHost === host && !h2Session.destroyed) {
    return h2Session
  }
  if (h2Session) {
    try {
      h2Session.destroy()
    } catch {
      // ignore
    }
  }
  h2Session = connect(host)
  h2SessionHost = host
  h2Session.on('error', () => {
    // Session will be recreated on next send.
    h2Session = null
  })
  return h2Session
}

async function sendToToken(
  jwt: string,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<'sent' | 'dead_token' | 'failed'> {
  try {
    const host = apnsHost()
    const session = getH2Session(host)
    const payload = JSON.stringify({
      aps: { alert: { title, body }, sound: 'default' },
      ...data,
    })

    const result = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = session.request({
          ':method': 'POST',
          ':path': `/3/device/${deviceToken}`,
          authorization: `bearer ${jwt}`,
          'apns-topic': APNS_BUNDLE_ID,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-length': Buffer.byteLength(payload),
        })
        let bodyText = ''
        req.on('response', (headers) => {
          const status = Number(headers[':status'] ?? 0)
          req.on('data', (chunk) => {
            bodyText += chunk.toString()
          })
          req.on('end', () => resolve({ status, body: bodyText }))
        })
        req.on('error', reject)
        req.end(payload)
      }
    )

    const { status } = result
    if (status === 200) {
      await logPushDebug(deviceToken, 'push_sent_200')
      return 'sent'
    }
    // 410 Gone / 400 BadDeviceToken: the token is dead, prune it.
    if (status === 410 || status === 400) {
      await logPushDebug(deviceToken, `push_dead_${status}:${result.body.slice(0, 100)}`)
      return 'dead_token'
    }
    logger.warn('[push] apns rejected', { status, body: result.body })
    await logPushDebug(deviceToken, `push_rejected_${status}:${result.body.slice(0, 100)}`)
    return 'failed'
  } catch (err) {
    logger.warn('[push] apns h2 failed', { error: String(err) })
    await logPushDebug(deviceToken, `push_error:${String(err).slice(0, 100)}`)
    return 'failed'
  }
}

// Log push outcomes to push_reg_debug so Apple rejections are visible.
async function logPushDebug(deviceToken: string, result: string) {
  try {
    const admin = getAdmin()
    await admin.from('push_reg_debug').insert({
      has_user: true,
      token_prefix: deviceToken.slice(0, 8),
      token_ok: true,
      platform: 'ios',
      result,
    })
  } catch {
    // Debug logging must never break pushes.
  }
}

export async function registerPushToken(
  userId: string,
  token: string,
  platform: string = 'ios'
): Promise<void> {
  const admin = getAdmin()
  const { error } = await admin.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' }
  )
  if (error) {
    logger.warn('[push] token upsert failed', { error: error.message })
    throw new Error(error.message)
  }
}

export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  const admin = getAdmin()
  await admin.from('push_tokens').delete().eq('user_id', userId).eq('token', token)
}

export type PushResult =
  | { attempted: false; reason: 'apns_not_configured' | 'no_tokens' }
  | { attempted: true; sent: number; pruned: number }

export async function sendPushToUser(
  userId: string,
  opts: { title: string; body: string; data?: Record<string, string> }
): Promise<PushResult> {
  if (!apnsConfigured()) {
    // Not an error: APNs creds arrive with the Apple Developer enrollment.
    // The token pipeline and in-app notifications work regardless.
    logger.info('[push] skipped — APNs not configured')
    await logPushDebug('none', `push_skip_not_configured:${userId.slice(0, 8)}`)
    return { attempted: false, reason: 'apns_not_configured' }
  }

  const admin = getAdmin()
  const { data: rows } = await admin
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('platform', 'ios')

  if (!rows?.length) {
    await logPushDebug('none', `push_skip_no_tokens:${userId.slice(0, 8)}`)
    return { attempted: false, reason: 'no_tokens' }
  }

  let jwt: string
  try {
    jwt = buildApnsJwt()
  } catch (err) {
    logger.warn('[push] jwt build failed', { error: String(err) })
    await logPushDebug(rows[0].token, `push_jwt_failed:${String(err).slice(0, 100)}`)
    return { attempted: true, sent: 0, pruned: 0 }
  }
  let sent = 0
  const dead: string[] = []
  for (const row of rows) {
    const outcome = await sendToToken(jwt, row.token, opts.title, opts.body, opts.data ?? {})
    if (outcome === 'sent') sent++
    else if (outcome === 'dead_token') dead.push(row.token)
  }
  if (dead.length) {
    await admin.from('push_tokens').delete().eq('user_id', userId).in('token', dead)
  }
  logger.info('[push] batch done', { userId, sent, pruned: dead.length, total: rows.length })
  return { attempted: true, sent, pruned: dead.length }
}
