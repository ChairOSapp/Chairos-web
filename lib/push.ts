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
  // The .p8 from Apple is PKCS#8 PEM; env may carry literal \n escapes.
  const key = process.env.APNS_KEY!.replace(/\\n/g, '\n')
  const signer = createSign('sha256')
  signer.update(`${header}.${payload}`)
  return `${header}.${payload}.${signer.sign(key, 'base64url')}`
}

function apnsHost(): string {
  return process.env.APNS_USE_SANDBOX === 'true'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com'
}

async function sendToToken(
  jwt: string,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<'sent' | 'dead_token' | 'failed'> {
  try {
    const res = await fetch(`${apnsHost()}/3/device/${deviceToken}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
      },
      body: JSON.stringify({
        aps: { alert: { title, body }, sound: 'default' },
        ...data,
      }),
    })
    if (res.status === 200) {
      await logPushDebug(deviceToken, 'push_sent_200')
      return 'sent'
    }
    // 410 Gone / 400 BadDeviceToken: the token is dead, prune it.
    if (res.status === 410 || res.status === 400) {
      const bodyText = await res.text().catch(() => '')
      await logPushDebug(deviceToken, `push_dead_${res.status}:${bodyText.slice(0, 100)}`)
      return 'dead_token'
    }
    const bodyText = await res.text().catch(() => '')
    logger.warn('[push] apns rejected', { status: res.status, body: bodyText })
    await logPushDebug(deviceToken, `push_rejected_${res.status}:${bodyText.slice(0, 100)}`)
    return 'failed'
  } catch (err) {
    logger.warn('[push] apns fetch failed', { error: String(err) })
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
    return { attempted: false, reason: 'apns_not_configured' }
  }

  const admin = getAdmin()
  const { data: rows } = await admin
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('platform', 'ios')

  if (!rows?.length) return { attempted: false, reason: 'no_tokens' }

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
