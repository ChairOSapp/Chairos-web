'use client'

import { useEffect, useState } from 'react'
import type { InfraData } from './types'

// Platform health: the pipes everything runs on — where the site lives
// (Vercel) and where the data lives (Supabase). Each provider is optional:
// until Thomas wires up tokens, the card shows plain-language setup steps
// instead of data. Tokens live server-side only; this component never sees
// them, only the status summaries the API route returns.

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function Dot({ color }: { color: 'green' | 'amber' | 'red' | 'gray' }) {
  const cls =
    color === 'green' ? 'bg-green-400'
    : color === 'amber' ? 'bg-amber-400'
    : color === 'red' ? 'bg-red-400'
    : 'bg-charcoal-600'
  return <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls}`} />
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[11px] bg-charcoal-950 border border-charcoal-800 rounded px-1.5 py-0.5 text-charcoal-200 whitespace-nowrap">
      {children}
    </code>
  )
}

function SetupSteps({ provider }: { provider: 'vercel' | 'supabase' }) {
  const steps =
    provider === 'vercel'
      ? [
          <>In Vercel, go to your account settings → Tokens → create a token. Call it something like <Code>chairos-admin-read</Code>.</>,
          <>Honest note: Vercel tokens can&apos;t be scoped read-only — it&apos;s a full-access token. It stays server-side only (this page never sees it), and you can revoke it anytime.</>,
          <>In the Vercel dashboard: your project → Settings → Environment Variables → add <Code>VERCEL_API_TOKEN</Code>. If your project slug isn&apos;t the default guess, also add <Code>VERCEL_PROJECT_ID</Code> — you&apos;ll find the exact id under Project → Settings → General.</>,
          <>Redeploy once so the new variables go live. This card lights up on its own after that.</>,
        ]
      : [
          <>In the Supabase dashboard: your organization → Access Tokens → create a token with read-only scope.</>,
          <>Grab your project ref — the 20-character string in your project URL (<Code>supabase.com/dashboard/project/&lt;ref&gt;</Code>), or under Project Settings → General.</>,
          <>In the Vercel dashboard: your project → Settings → Environment Variables → add <Code>SUPABASE_MANAGEMENT_TOKEN</Code> and <Code>SUPABASE_PROJECT_REF</Code>, then redeploy once. This card lights up after that.</>,
        ]
  return (
    <ol className="space-y-2.5 mt-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-2.5 text-xs text-charcoal-400 leading-relaxed">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-charcoal-800 text-charcoal-300 text-[10px] font-bold flex items-center justify-center">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

function providerErrorLine(error: string | null, provider: 'Vercel' | 'Supabase'): string {
  switch (error) {
    case 'token_rejected':
      return `${provider} didn't accept the token — it may be expired or revoked. Make a fresh one and swap it in.`
    case 'project_not_found':
      return `${provider} couldn't find that project — double-check the project id/ref in your env vars.`
    case 'rate_limited':
      return `${provider} told us to slow down — this usually clears in a minute. Hit refresh.`
    case 'network':
      return `Couldn't reach the ${provider} API — probably a blip on the wire. Refresh to retry.`
    default:
      return `The ${provider} API answered with an error — worth a glance if it keeps happening.`
  }
}

function VercelCard({ data, site }: { data: InfraData['vercel']; site: InfraData['site'] }) {
  return (
    <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
      <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-2">
        Hosting · Vercel
      </div>

      {!data.configured && (
        <>
          <div className="flex items-center gap-2.5 mb-1">
            <Dot color="gray" />
            <span className="text-sm text-charcoal-200 font-medium">Not connected yet</span>
          </div>
          <p className="text-xs text-charcoal-500 leading-relaxed">
            Wire up a Vercel token and this card watches your deploys for you —
            you&apos;ll know the moment a bad push goes out.
          </p>
          <SetupSteps provider="vercel" />
        </>
      )}

      {data.configured && !data.ok && (
        <>
          <div className="flex items-center gap-2.5 mb-1">
            <Dot color="amber" />
            <span className="text-sm text-amber-300 font-medium">Can&apos;t read deploys right now</span>
          </div>
          <p className="text-xs text-charcoal-500 leading-relaxed">{providerErrorLine(data.error, 'Vercel')}</p>
        </>
      )}

      {data.configured && data.ok && !data.latest && (
        <p className="text-xs text-charcoal-500 leading-relaxed">
          Connected, but Vercel isn&apos;t showing any deployments for this project yet.
        </p>
      )}

      {data.configured && data.ok && data.latest && (
        <>
          {data.latest.state === 'READY' && (
            <>
              <div className="flex items-center gap-2.5 mb-1">
                <Dot color="green" />
                <span className="text-sm text-green-400 font-medium">Live</span>
              </div>
              <p className="text-xs text-charcoal-400 leading-relaxed">
                Deployed {timeAgo(data.latest.createdAt)}
                {data.latest.commitMessage ? ` — “${data.latest.commitMessage.slice(0, 80)}${data.latest.commitMessage.length > 80 ? '…' : ''}”` : ''}
                {data.latest.commitSha ? ` (${data.latest.commitSha})` : ''}
              </p>
            </>
          )}
          {data.latest.state === 'ERROR' && (
            <>
              <div className="flex items-center gap-2.5 mb-1">
                <Dot color="red" />
                <span className="text-sm text-red-300 font-medium">The last deploy failed</span>
              </div>
              <p className="text-xs text-charcoal-400 leading-relaxed">
                The site is still running the previous good build — nothing your clients
                see changed. {data.latest.createdAt ? `It went out ${timeAgo(data.latest.createdAt)}. ` : ''}
                {data.recentFailures > 1 ? `${data.recentFailures} of the last 10 deploys failed — that's a pattern, not a fluke.` : 'Check what broke in the push, then redeploy.'}
              </p>
            </>
          )}
          {['BUILDING', 'QUEUED', 'INITIALIZING'].includes(data.latest.state) && (
            <>
              <div className="flex items-center gap-2.5 mb-1">
                <Dot color="amber" />
                <span className="text-sm text-amber-300 font-medium">Deploying right now</span>
              </div>
              <p className="text-xs text-charcoal-400 leading-relaxed">
                A new build started {timeAgo(data.latest.createdAt)} — the site keeps
                serving the current version until it lands.
              </p>
            </>
          )}
          {data.latest.state === 'CANCELED' && (
            <>
              <div className="flex items-center gap-2.5 mb-1">
                <Dot color="amber" />
                <span className="text-sm text-amber-300 font-medium">Last deploy was canceled</span>
              </div>
              <p className="text-xs text-charcoal-400 leading-relaxed">
                The previous build is still live — nothing changed for your clients.
              </p>
            </>
          )}
          {!['READY', 'ERROR', 'BUILDING', 'QUEUED', 'INITIALIZING', 'CANCELED'].includes(data.latest.state) && (
            <p className="text-xs text-charcoal-400 leading-relaxed">
              Latest deploy is in state “{data.latest.state}” — not one of the usual ones, worth a peek.
            </p>
          )}
        </>
      )}

      <div className="border-t border-charcoal-800 mt-3 pt-2.5">
        <div className="flex items-center gap-2.5">
          <Dot color={data.configured ? (data.ok ? 'green' : 'amber') : 'gray'} />
          <span className="text-xs text-charcoal-400">
            {site.ok
              ? <>{site.url.replace(/^https?:\/\//, '')} answered in {site.latencyMs}ms</>
              : site.error === 'unreachable'
                ? <>The site didn&apos;t answer just now — worth a look if it keeps up.</>
                : <>The site answered {site.statusCode} just now.</>}
          </span>
        </div>
      </div>
    </div>
  )
}

function SupabaseCard({ data }: { data: InfraData['supabase'] }) {
  const healthy = data.ok && data.status === 'ACTIVE_HEALTHY'
  return (
    <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4">
      <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-charcoal-500 mb-2">
        Database · Supabase
      </div>

      {!data.configured && (
        <>
          <div className="flex items-center gap-2.5 mb-1">
            <Dot color="gray" />
            <span className="text-sm text-charcoal-200 font-medium">Not connected yet</span>
          </div>
          <p className="text-xs text-charcoal-500 leading-relaxed">
            Wire up a Supabase token and this card watches the database project itself —
            you&apos;ll see it here if Supabase ever flags a problem.
          </p>
          <SetupSteps provider="supabase" />
        </>
      )}

      {data.configured && !data.ok && (
        <>
          <div className="flex items-center gap-2.5 mb-1">
            <Dot color="amber" />
            <span className="text-sm text-amber-300 font-medium">Can&apos;t read project status right now</span>
          </div>
          <p className="text-xs text-charcoal-500 leading-relaxed">{providerErrorLine(data.error, 'Supabase')}</p>
        </>
      )}

      {healthy && (
        <>
          <div className="flex items-center gap-2.5 mb-1">
            <Dot color="green" />
            <span className="text-sm text-green-400 font-medium">Healthy</span>
          </div>
          <p className="text-xs text-charcoal-400 leading-relaxed">
            {data.name ? <>Project <span className="text-charcoal-200">{data.name}</span></> : 'Your project'}
            {data.region ? <> · {data.region}</> : ''} — Supabase reports it active and healthy.
          </p>
        </>
      )}

      {data.configured && data.ok && !healthy && (
        <>
          <div className="flex items-center gap-2.5 mb-1">
            <Dot color="red" />
            <span className="text-sm text-red-300 font-medium">Needs a look</span>
          </div>
          <p className="text-xs text-charcoal-400 leading-relaxed">
            Supabase says the project is in state “{data.status ?? 'unknown'}” — that&apos;s not
            the normal healthy state. Open the Supabase dashboard to see what it wants.
          </p>
        </>
      )}
    </div>
  )
}

export default function PlatformHealth() {
  const [infra, setInfra] = useState<InfraData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/infra')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setInfra(d); else if (!cancelled) setFailed(true) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  if (failed) {
    return (
      <p className="text-xs text-charcoal-500 leading-relaxed">
        Couldn&apos;t pull platform health — refresh the page to retry.
      </p>
    )
  }

  if (!infra) {
    return (
      <div className="grid md:grid-cols-2 gap-3">
        {[0, 1].map(i => (
          <div key={i} className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 p-4 animate-pulse">
            <div className="h-3 w-28 bg-charcoal-800 rounded mb-3" />
            <div className="h-4 w-40 bg-charcoal-800 rounded mb-2" />
            <div className="h-3 w-full bg-charcoal-800 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <VercelCard data={infra.vercel} site={infra.site} />
      <SupabaseCard data={infra.supabase} />
      <p className="md:col-span-2 text-[11px] text-charcoal-600">
        Checked {timeAgo(infra.generatedAt)} · tokens stay on the server — this page only ever sees the summary.
      </p>
    </div>
  )
}
