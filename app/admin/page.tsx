'use client'

import { useEffect, useMemo, useState } from 'react'
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

type McTab = 'actions' | 'directory' | 'health' | 'feedback'

const TABS: { id: McTab; label: string; icon: string }[] = [
  { id: 'actions', label: 'Actions', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'directory', label: 'Directory', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'health', label: 'Health', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
  { id: 'feedback', label: 'Feedback', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
]

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()

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
  const [mcTab, setMcTab] = useState<McTab>('actions')

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

  // Alert taps open the dossier they describe — a trial alert opens that
  // account, a shop alert opens that shop. Alerts with no subject fall back
  // to the Health tab.
  function jumpTo(action: PulseAction) {
    if (action.refId) {
      if (action.kind === 'no_hours' || action.kind === 'no_square') {
        setDrill({ kind: 'shop', id: action.refId })
      } else {
        setDrill({ kind: 'user', id: action.refId })
      }
      window.scrollTo({ top: 0 })
      return
    }
    setMcTab('health')
    window.scrollTo({ top: 0 })
  }

  function openDrill(kind: 'shop' | 'user', id: string) {
    setDrill({ kind, id })
    window.scrollTo({ top: 0 })
  }

  if (!authed) return null

  const actionCount = actions.filter(a => a.severity !== 'info').length

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

      {/* Desktop tab bar */}
      {!drill && !loading && !loadError && (
        <div className="hidden md:block border-b border-charcoal-800 bg-charcoal-950">
          <div className="max-w-6xl mx-auto px-6 flex gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => { setMcTab(t.id); window.scrollTo({ top: 0 }) }}
                className={`px-5 py-3 text-xs font-bold tracking-widest uppercase border-b-2 -mb-px transition-colors ${
                  mcTab === t.id
                    ? 'text-[#8A9A3B] border-[#8A9A3B]'
                    : 'text-charcoal-500 border-transparent hover:text-charcoal-200'
                }`}
              >
                {t.label}
                {t.id === 'actions' && actionCount > 0 && (
                  <span className="ml-2 text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full">{actionCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 md:py-8 pb-32 md:pb-16">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-charcoal-500 text-sm py-24">
            <div className="w-5 h-5 border-2 border-[#7A8C3A] border-t-transparent rounded-full animate-spin" />
            Pulling the briefing together…
          </div>
        ) : loadError || !pulse || !metrics ? (
          <div className="rounded-2xl border border-red-900/60 bg-charcoal-900 p-8 text-center">
            <p className="text-red-300 text-sm font-semibold mb-1">Couldn&apos;t load the briefing</p>
            <p className="text-charcoal-500 text-xs">Check that your admin session is active, then hit refresh.</p>
          </div>
        ) : drill ? (
          drill.kind === 'shop' ? (
            <ShopDetail shopId={drill.id} onBack={() => setDrill(null)} onOpenUser={(id) => openDrill('user', id)} />
          ) : (
            <UserDetail userId={drill.id} onBack={() => setDrill(null)} onOpenShop={(id) => openDrill('shop', id)} />
          )
        ) : (
          <>
            {mcTab === 'actions' && (
              <div className="space-y-5">
                <PulseHeader pulse={{ ...pulse, actions }} onSelect={jumpTo} />
                <Section id="action-queue" eyebrow="First things first" title="Action queue"
                  blurb="Everything on this list is costing you money, bookings, or trust until it\u2019s handled.">
                  <ActionQueue actions={actions} onJump={jumpTo} />
                </Section>
              </div>
            )}

            {mcTab === 'directory' && (
              <div>
                <div className="mb-3">
                  <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-1">Drill down</div>
                  <h2 className="font-serif text-xl text-charcoal-100">Directory</h2>
                  <p className="text-xs text-charcoal-500 mt-1 max-w-xl">Every account and every shop. Tap a row for the full dossier.</p>
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
                    ? <AccountsTable users={users} loading={false} onOpenDetail={(id) => openDrill('user', id)} />
                    : <ShopsTable shops={shops} loading={false} onOpenDetail={(id) => openDrill('shop', id)} />}
                </div>
              </div>
            )}

            {mcTab === 'health' && (
              <div className="space-y-6">
                <Section id="vitals" eyebrow="The business" title="Business vitals"
                  blurb="Is ChairOS making money and keeping customers? Direction matters more than any single number.">
                  <VitalsGrid metrics={metrics} />
                </Section>
                <Section id="customers" eyebrow="The people" title="Customer health"
                  blurb="Clients are the product here — locked in, drifting away, or standing you up.">
                  <CustomerHealth pulse={pulse} />
                </Section>
                <Section id="product" eyebrow="The app" title="Product health"
                  blurb="Is the thing itself behaving? Errors and background jobs, at a glance.">
                  <ProductHealth metrics={metrics} pulse={pulse} />
                </Section>
                <Section id="platform" eyebrow="Under the hood" title="Platform health"
                  blurb="The pipes everything else runs on — where the site lives and where the data lives.">
                  <PlatformHealth />
                </Section>
                <Section id="growth" eyebrow="Momentum" title="Growth"
                  blurb="Are more people finding ChairOS and actually booking through it?">
                  <GrowthSection metrics={metrics} pulse={pulse} />
                </Section>
              </div>
            )}

            {mcTab === 'feedback' && (
              <Section id="feedback" eyebrow="From users" title="App feedback"
                blurb="What users are saying about the app — feature requests and improvements.">
                <FeedbackReview />
              </Section>
            )}

            <p className="text-center text-[11px] text-charcoal-700 pt-4">
              Founder eyes only · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </>
        )}
      </div>

      {/* Mobile bottom nav — app-style */}
      {!drill && !loading && !loadError && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="bg-charcoal-900/95 backdrop-blur border border-charcoal-700 rounded-2xl px-2 py-2 grid grid-cols-4 shadow-2xl">
            {TABS.map(t => {
              const active = mcTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => { setMcTab(t.id); window.scrollTo({ top: 0 }) }}
                  className={`relative flex flex-col items-center gap-1 py-2 rounded-xl transition-colors ${
                    active ? 'text-[#8A9A3B]' : 'text-charcoal-500'
                  }`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={t.icon} />
                  </svg>
                  <span className="text-[10px] font-bold">{t.label}</span>
                  {t.id === 'actions' && actionCount > 0 && (
                    <span className="absolute top-1 right-1/2 translate-x-4 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {actionCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
