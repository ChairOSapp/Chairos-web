import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAdminEmail } from '@/lib/admin'
import type { InfraData, InfraDeployment } from '@/components/admin/types'

// Founder-only platform health: the real infrastructure behind ChairOS.
// Proxies the Vercel REST API (hosting/frontend) and the Supabase Management
// API (database/backend), plus a light synthetic ping of the public site.
// Tokens live ONLY here, in server env vars — the response carries status
// summaries, never secrets.
//
// Env vars (all optional; missing ones degrade gracefully):
//   VERCEL_API_TOKEN        Vercel personal token (vercel.com/account/tokens).
//                           Note: Vercel personal tokens can't be scoped
//                           read-only — use a dedicated token you can revoke.
//   VERCEL_PROJECT_ID       Vercel project id or slug. Defaults to a guess
//                           ('chairos-web'); if the card says "project not
//                           found", paste the exact id from Vercel project
//                           settings.
//   VERCEL_TEAM_ID          Only if the project lives under a Vercel team.
//   SUPABASE_MANAGEMENT_TOKEN  Supabase access token (dashboard → Access
//                           Tokens) with read scope.
//   SUPABASE_PROJECT_REF    20-char project ref from the Supabase dashboard
//                           URL / project settings.
//   SITE_URL                Public URL to ping (default https://chairos.cc).

export const dynamic = 'force-dynamic'

async function getRequestUser(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// One admin, one pair of eyes — a short in-memory cache keeps us from
// hammering the provider APIs every time he glances at the page.
const CACHE_TTL_MS = 120_000
let cache: { data: InfraData; fetchedAt: number } | null = null

function vercelHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function mapDeployment(d: Record<string, unknown>): InfraDeployment {
  const meta = (d.meta ?? {}) as Record<string, unknown>
  return {
    state: String(d.state ?? d.readyState ?? 'UNKNOWN'),
    createdAt: new Date(Number(d.created ?? Date.now())).toISOString(),
    commitMessage: typeof meta.githubCommitMessage === 'string' ? meta.githubCommitMessage : null,
    commitSha: typeof meta.githubCommitSha === 'string' ? String(meta.githubCommitSha).slice(0, 7) : null,
    url: typeof d.url === 'string' ? `https://${d.url}` : null,
    target: typeof d.target === 'string' ? d.target : null,
  }
}

async function fetchVercel(token: string, projectId: string, teamId?: string) {
  const params = new URLSearchParams({ projectId, limit: '10' })
  if (teamId) params.set('teamId', teamId)
  // v6 list-deployments is the stable, documented endpoint for this.
  const res = await fetch(`https://api.vercel.com/v6/deployments?${params.toString()}`, {
    headers: vercelHeaders(token),
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401 || res.status === 403) {
    return { ok: false as const, error: 'token_rejected' }
  }
  if (res.status === 404) {
    return { ok: false as const, error: 'project_not_found' }
  }
  if (res.status === 429) {
    return { ok: false as const, error: 'rate_limited' }
  }
  if (!res.ok) {
    return { ok: false as const, error: 'api_error' }
  }
  const body = (await res.json()) as { deployments?: Record<string, unknown>[] }
  const deployments = (body.deployments ?? []).map(mapDeployment)
  return {
    ok: true as const,
    latest: deployments[0] ?? null,
    lastGood: deployments.find(d => d.state === 'READY') ?? null,
    recentFailures: deployments.filter(d => d.state === 'ERROR').length,
  }
}

async function fetchSupabase(token: string, ref: string) {
  // GET /v1/projects/{ref} is the stable documented endpoint; its `status`
  // field (e.g. ACTIVE_HEALTHY) is the health signal.
  const res = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401 || res.status === 403) {
    return { ok: false as const, error: 'token_rejected' }
  }
  if (res.status === 404) {
    return { ok: false as const, error: 'project_not_found' }
  }
  if (res.status === 429) {
    return { ok: false as const, error: 'rate_limited' }
  }
  if (!res.ok) {
    return { ok: false as const, error: 'api_error' }
  }
  const body = (await res.json()) as { status?: string; name?: string; region?: string }
  return {
    ok: true as const,
    status: typeof body.status === 'string' ? body.status : null,
    name: typeof body.name === 'string' ? body.name : null,
    region: typeof body.region === 'string' ? body.region : null,
  }
}

async function pingSite(url: string) {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'ChairOS-admin-health/1.0' },
    })
    return {
      ok: res.ok,
      statusCode: res.status,
      latencyMs: Date.now() - started,
      url,
      checkedAt: new Date().toISOString(),
      error: null as string | null,
    }
  } catch {
    return {
      ok: false,
      statusCode: null as number | null,
      latencyMs: null as number | null,
      url,
      checkedAt: new Date().toISOString(),
      error: 'unreachable' as string | null,
    }
  }
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cache.data)
  }

  const vercelToken = process.env.VERCEL_API_TOKEN
  const vercelProject = process.env.VERCEL_PROJECT_ID || 'chairos-web'
  const vercelTeam = process.env.VERCEL_TEAM_ID || undefined
  const supaToken = process.env.SUPABASE_MANAGEMENT_TOKEN
  const supaRef = process.env.SUPABASE_PROJECT_REF
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://chairos.cc'

  const [vercel, supabase, site] = await Promise.all([
    (async () => {
      if (!vercelToken) {
        return { configured: false, ok: false, error: null, latest: null, lastGood: null, recentFailures: 0 }
      }
      try {
        const r = await fetchVercel(vercelToken, vercelProject, vercelTeam)
        if (!r.ok) {
          return { configured: true, ok: false, error: r.error, latest: null, lastGood: null, recentFailures: 0 }
        }
        return { configured: true, ok: true, error: null, latest: r.latest, lastGood: r.lastGood, recentFailures: r.recentFailures }
      } catch {
        return { configured: true, ok: false, error: 'network', latest: null, lastGood: null, recentFailures: 0 }
      }
    })(),
    (async () => {
      if (!supaToken || !supaRef) {
        return { configured: false, ok: false, error: null, status: null, name: null, region: null }
      }
      try {
        const r = await fetchSupabase(supaToken, supaRef)
        if (!r.ok) {
          return { configured: true, ok: false, error: r.error, status: null, name: null, region: null }
        }
        return { configured: true, ok: true, error: null, status: r.status, name: r.name, region: r.region }
      } catch {
        return { configured: true, ok: false, error: 'network', status: null, name: null, region: null }
      }
    })(),
    pingSite(siteUrl),
  ])

  const data: InfraData = { generatedAt: new Date().toISOString(), vercel, supabase, site }
  cache = { data, fetchedAt: Date.now() }
  return NextResponse.json(data)
}
