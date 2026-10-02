'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Section from '@/components/admin/Section'
import PulseHeader from '@/components/admin/PulseHeader'
import ActionQueue from '@/components/admin/ActionQueue'
import VitalsGrid from '@/components/admin/VitalsGrid'
import CustomerHealth from '@/components/admin/CustomerHealth'
import ProductHealth from '@/components/admin/ProductHealth'
import PlatformHealth from '@/components/admin/PlatformHealth'
import FeedbackReview from '@/components/admin/FeedbackReview'
import GrowthSection from '@/components/admin/GrowthSection'
import AccountsTable from '@/components/admin/AccountsTable'
import ShopsTable from '@/components/admin/ShopsTable'
import ShopDetail from '@/components/admin/ShopDetail'
import UserDetail from '@/components/admin/UserDetail'
import type {
  AdminShopRow,
  AdminUserRow,
  MetricsData,
  PulseAction,
  PulseData,
} from '@/components/admin/types'

// ── Section registry ──────────────────────────────────────────────────────
// This is the extensibility contract: a future metric (push-notification
// adoption, App Store downloads/ratings, …) becomes a new entry here with
// its own component — no restructuring of the page, no touching other
// sections. Order in this array = order on screen.
type SectionDef =
  | { kind: 'component'; id: string; eyebrow: string; title: string; blurb?: string; render: () => React.ReactNode }
  | { kind: 'tabs'; id: string }

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()
  const tabsRef = useRef<HTMLDivElement>(null)

  const [authed, setAuthed] = useState(false)
  const [pulse, setPulse] = useState<PulseData | null>(null)
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [shops, setShops] = useState<AdminShopRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'accounts' | 'shops'>('accounts')
  const [loadError, setLoadError] = useState(false)
  const [drill, setDrill] = useState<{ kind: 'shop' | 'user'; id: string } | null>(null)

  const sectionNav = [
    { id: 'action-queue', label: 'Actions' },
    { id: 'vitals', label: 'Vitals' },
    { id: 'customers', label: 'Customers' },
    { id: 'product', label: 'Product' },
    { id: 'platform', label: 'Platform' },
    { id: 'growth', label: 'Growth' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'directory', label: 'Directory' },
  ]

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setAuthed(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchAll() {
    try {
      const [p, m, u, s] = await Promise.all([
        fetch('/api/admin/pulse').then(r => (r.ok ? r.json() : null)),
        fetch('/api/admin/metrics').then(r => (r.ok ? r.json() : null)),
        fetch('/api/admin/users').then(r => (r.ok ? r.json() : null)),
        fetch('/api/admin/shops').then(r => (r.ok ? r.json() : null)),
      ])
      if (!p || !m) { setLoadError(true); return }
      setPulse(p)
      setMetrics(m)
      setUsers(u?.users ?? [])
      setShops(s?.shops ?? [])
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }

  useEffect(() => {
    if (!authed) return
    setLoading(true)
    fetchAll().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])

  async function refresh() {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }

  // Merge server-computed pulse actions with client-side signals the pulse
  // endpoint doesn't own: critical accounts (from /api/admin/users health)
  // and the Sentry error spike (from /api/admin/metrics).
  const actions: PulseAction[] = useMemo(() => {
    const list: PulseAction[] = [...(pulse?.actions ?? [])].map(a => ({
      ...a,
      target: a.kind === 'trial_ending' || a.kind === 'past_due'
        ? { tab: 'accounts' as const }
        : { tab: 'shops' as const },
    }))
    for (const u of users) {
      if (u.health !== 'critical') continue
      if (list.some(a => a.id === `trial-${u.id}` || a.id === `billing-${u.id}`)) continue
      list.push({
        id: `acct-${u.id}`,
        severity: 'critical',
        kind: 'critical_account',
        title: `${u.full_name || u.email} needs a look`,
        why: 'One of the automated health checks flagged this account — open it to see exactly what tripped.',
        detail: u.health_reasons.slice(0, 2).join(' · '),
        refId: u.id,
        refName: u.full_name || u.email,
        target: { tab: 'accounts' },
      })
    }
    const errCount = metrics?.recentErrors?.status === 'live' ? (metrics.recentErrors.count ?? 0) : 0
    if (errCount > 0) {
      list.push({
        id: 'error-spike',
        severity: 'warning',
        kind: 'error_spike',
        title: `${errCount} unresolved app error${errCount === 1 ? '' : 's'} in the last 24h`,
        why: 'Crashes and failed requests erode trust fast. The culprits are listed under Product health below.',
        detail: metrics?.recentErrors?.issues?.[0]?.title ?? '',
        refId: null,
        refName: null,
        target: null,
      })
    }
    const rank = { critical: 0, warning: 1, info: 2 } as const
    return list.sort((a, b) => rank[a.severity] - rank[b.severity])
  }, [pulse, users, metrics])

  // Alert clicks go straight to the dossier they describe — a trial alert
  // opens that account, a shop alert opens that shop. Only alerts with no
  // specific subject fall back to scrolling the directory into view.
  function jumpTo(action: PulseAction) {
    if (action.refId) {
      if (action.kind === 'no_hours' || action.kind === 'no_square') {
        setDrill({ kind: 'shop', id: action.refId })
      } else {
        setDrill({ kind: 'user', id: action.refId })
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setActiveTab('accounts')
    requestAnimationFrame(() => {
      tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const sections: SectionDef[] = useMemo(() => {
    if (!pulse || !metrics) return []
    return [
      {
        kind: 'component', id: 'action-queue', eyebrow: 'First things first', title: 'Action queue',
        blurb: 'Everything on this list is costing you money, bookings, or trust until it\u2019s handled.',
        render: () => <ActionQueue actions={actions} onJump={jumpTo} />,
      },
      {
        kind: 'component', id: 'vitals', eyebrow: 'The business', title: 'Business vitals',
        blurb: 'Is ChairOS making money and keeping customers? Direction matters more than any single number.',
        render: () => <VitalsGrid metrics={metrics} />,
      },
      {
        kind: 'component', id: 'customers', eyebrow: 'The people', title: 'Customer health',
        blurb: 'Clients are the product here — locked in, drifting away, or standing you up.',
        render: () => <CustomerHealth pulse={pulse} />,
      },
      {
        kind: 'component', id: 'product', eyebrow: 'The app', title: 'Product health',
        blurb: 'Is the thing itself behaving? Errors and background jobs, at a glance.',
        render: () => <ProductHealth metrics={metrics} pulse={pulse} />,
      },
      {
        kind: 'component', id: 'platform', eyebrow: 'Under the hood', title: 'Platform health',
        blurb: 'The pipes everything else runs on — where the site lives and where the data lives.',
        render: () => <PlatformHealth />,
      },
      {
        kind: 'component', id: 'growth', eyebrow: 'Momentum', title: 'Growth',
        blurb: 'Are more people finding ChairOS and actually booking through it?',
        render: () => <GrowthSection metrics={metrics} pulse={pulse} />,
      },
      {
        kind: 'component', id: 'feedback', eyebrow: 'From users', title: 'App feedback',
        blurb: 'What users are saying about the app — feature requests and improvements.',
        render: () => <FeedbackReview />,
      },
      { kind: 'tabs', id: 'directory' },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse, metrics, actions])

  if (!authed) return null

  return (
    <div className="min-h-screen bg-charcoal-950">
      <header className="bg-charcoal-900/90 backdrop-blur border-b border-charcoal-800 px-4 md:px-6 min-h-14 pt-[env(safe-area-inset-top)] flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="font-serif text-[#8A9A3B] text-lg">ChairOS</span>
          <span className="text-charcoal-600 text-xs">·</span>
          <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-charcoal-400">Mission control</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
            className="flex items-center gap-1.5 text-xs font-semibold text-charcoal-300 border border-charcoal-700 bg-charcoal-800 hover:bg-charcoal-700 px-4 min-h-[44px] rounded-lg transition-colors"
          >
            Sign out
          </button>
          <button
            onClick={refresh}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-charcoal-300 border border-charcoal-700 bg-charcoal-800 hover:bg-charcoal-700 px-4 min-h-[44px] rounded-lg transition-colors disabled:opacity-50"
          >
            {refreshing ? (
              <>
                <div className="w-3 h-3 border-2 border-[#7A8C3A] border-t-transparent rounded-full animate-spin" />
                Refreshing…
              </>
            ) : '↻ Refresh'}
          </button>
        </div>
      </header>

      {!drill && (
        <div className="sticky top-14 z-40 bg-charcoal-950/95 backdrop-blur border-b border-charcoal-800">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-2 flex gap-1.5 overflow-x-auto">
            {sectionNav.map(s => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className="flex-shrink-0 text-[11px] font-bold tracking-widest uppercase text-charcoal-400 hover:text-charcoal-100 bg-charcoal-900 hover:bg-charcoal-800 border border-charcoal-800 px-3 py-1.5 rounded-full transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 md:py-8 pb-16 space-y-6">
        {drill ? (
          drill.kind === 'shop' ? (
            <ShopDetail shopId={drill.id} onBack={() => setDrill(null)} onOpenUser={(id) => setDrill({ kind: 'user', id })} />
          ) : (
            <UserDetail userId={drill.id} onBack={() => setDrill(null)} onOpenShop={(id) => setDrill({ kind: 'shop', id })} />
          )
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 text-charcoal-500 text-sm py-24">
            <div className="w-5 h-5 border-2 border-[#7A8C3A] border-t-transparent rounded-full animate-spin" />
            Pulling the briefing together…
          </div>
        ) : loadError || !pulse || !metrics ? (
          <div className="rounded-2xl border border-red-900/60 bg-charcoal-900 p-8 text-center">
            <p className="text-red-300 text-sm font-semibold mb-1">Couldn&apos;t load the briefing</p>
            <p className="text-charcoal-500 text-xs">Check that your admin session is active, then hit refresh.</p>
          </div>
        ) : (
          <>
            <PulseHeader pulse={{ ...pulse, actions }} />

            {sections.map(s =>
              s.kind === 'tabs' ? (
                <div key={s.id} ref={tabsRef} id="directory" className="scroll-mt-28">
                  <div className="flex items-end justify-between gap-3 mb-3">
                    <div>
                      <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-1">
                        Drill down
                      </div>
                      <h2 className="font-serif text-xl text-charcoal-100">Directory</h2>
                      <p className="text-xs text-charcoal-500 mt-1 max-w-xl">
                        Every account and every shop. Search it, filter by health, tap a row for the full story.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
                    <div className="flex gap-1.5 bg-charcoal-950 p-1 rounded-xl mb-4 w-fit">
                      {(['accounts', 'shops'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setActiveTab(t)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase transition-colors ${
                            activeTab === t ? 'bg-charcoal-700 text-charcoal-100' : 'text-charcoal-500 hover:text-charcoal-200'
                          }`}
                        >
                          {t === 'accounts' ? `Accounts (${users.length})` : `Shops (${shops.length})`}
                        </button>
                      ))}
                    </div>
                    {activeTab === 'accounts'
                      ? <AccountsTable users={users} loading={false} onOpenDetail={(id) => setDrill({ kind: 'user', id })} />
                      : <ShopsTable shops={shops} loading={false} onOpenDetail={(id) => setDrill({ kind: 'shop', id })} />}
                  </div>
                </div>
              ) : (
                <Section
                  key={s.id}
                  id={s.id}
                  eyebrow={s.eyebrow}
                  title={s.title}
                  blurb={s.blurb}
                >
                  {s.render()}
                </Section>
              )
            )}

            <p className="text-center text-[11px] text-charcoal-700 pt-4">
              Founder eyes only · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
