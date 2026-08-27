'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type HealthStatus = 'healthy' | 'warning' | 'critical'
type Tab = 'accounts' | 'shops'
type SortKey = 'full_name' | 'email' | 'role' | 'subscription_status' | 'created_at' | 'health'

interface AdminUser {
  id: string
  email: string
  full_name: string | null
  role: string | null
  plan_type: string | null
  subscription_status: string | null
  stripe_subscription_id: string | null
  created_at: string
  shop_id: string | null
  shop_name: string | null
  shop_code: string | null
  health: HealthStatus
  health_reasons: string[]
}

interface Metrics {
  mrr: number
  mrrChange: number | null
  activeShops: number
  activeSolo: number
  newSignups: number
  newSignupsWeek: number
  churnedCount: number
  revenueLostToChurn: number
  totalProfiles: number
  paidCount: number
  trialingCount: number
  conversionRate: number | null
  verticalBreakdown: Record<string, number>
  appointmentsWeek: number
  appointmentsMonth: number
  lockedRelationships: number
  recentErrors: {
    status: 'live' | 'pending' | 'error'
    count?: number
    issues?: { title: string; culprit: string; lastSeen: string; count: string }[]
    reason?: string
  }
}

interface AdminShop {
  id: string
  name: string
  vertical: string | null
  shopCode: string | null
  createdAt: string
  ownerEmail: string | null
  ownerName: string | null
  subscriptionStatus: string | null
  lastActiveAt: string | null
  appointmentCount: number
  revenueTotal: number
  clientCount: number
  lockedCount: number
}

const HEALTH_STYLES: Record<HealthStatus, { badge: string; dot: string }> = {
  healthy: { badge: 'bg-green-900/50 text-green-300 border border-green-700/50', dot: 'bg-green-400' },
  warning: { badge: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50', dot: 'bg-yellow-400' },
  critical: { badge: 'bg-red-900/50 text-red-300 border border-red-700/50', dot: 'bg-red-400' },
}

const SUB_STATUS_COLOR: Record<string, string> = {
  active: 'text-green-400',
  trialing: 'text-sky-400',
  past_due: 'text-yellow-400',
  grace_period: 'text-orange-400',
  cancelled: 'text-red-400',
}

function HealthBadge({ status }: { status: HealthStatus }) {
  const s = HEALTH_STYLES[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {status}
    </span>
  )
}

function MetricCard({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-od-green/10 border-od-green/30' : 'bg-warm-100 border-warm-200'}`}>
      <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">{label}</div>
      <div className={`font-serif text-2xl ${highlight ? 'text-od-green' : 'text-charcoal-900'}`}>{value}</div>
      {sub && <div className="text-xs text-charcoal-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()

  const [authed, setAuthed] = useState(false)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [rerunning, setRerunning] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('accounts')

  // Accounts tab state
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [healthFilter, setHealthFilter] = useState<HealthStatus | 'all'>('all')

  // Shops tab state
  const [shops, setShops] = useState<AdminShop[]>([])
  const [loadingShops, setLoadingShops] = useState(true)
  const [shopSearch, setShopSearch] = useState('')
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setAuthed(true)
    })
  }, [])

  async function fetchMetrics() {
    setLoadingMetrics(true)
    try {
      const res = await fetch('/api/admin/metrics')
      if (res.ok) setMetrics(await res.json())
      else setMetrics(null)
    } finally {
      setLoadingMetrics(false)
    }
  }

  async function fetchUsers() {
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users ?? [])
      }
    } finally {
      setLoadingUsers(false)
    }
  }

  async function fetchShops() {
    setLoadingShops(true)
    try {
      const res = await fetch('/api/admin/shops')
      if (res.ok) {
        const data = await res.json()
        setShops(data.shops ?? [])
      }
    } finally {
      setLoadingShops(false)
    }
  }

  useEffect(() => {
    if (!authed) return
    fetchMetrics()
    fetchUsers()
    fetchShops()
  }, [authed])

  async function rerunHealthChecks() {
    setRerunning(true)
    await fetchUsers()
    setRerunning(false)
  }

  // ── Accounts tab derived data ──
  const filtered = useMemo(() => {
    let list = users
    if (healthFilter !== 'all') list = list.filter(u => u.health === healthFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(u =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.shop_name || '').toLowerCase().includes(q) ||
        (u.shop_code || '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      const va = a[sortKey] ?? ''
      const vb = b[sortKey] ?? ''
      const cmp = String(va).localeCompare(String(vb))
      return sortAsc ? cmp : -cmp
    })
  }, [users, search, sortKey, sortAsc, healthFilter])

  const healthCounts = useMemo(() => ({
    healthy: users.filter(u => u.health === 'healthy').length,
    warning: users.filter(u => u.health === 'warning').length,
    critical: users.filter(u => u.health === 'critical').length,
  }), [users])

  // ── Shops tab derived data ── read-only rows straight from
  // /api/admin/shops, one per shop, not grouped by account.
  const filteredShops = useMemo(() => {
    let list = shops
    if (shopSearch) {
      const q = shopSearch.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.shopCode || '').toLowerCase().includes(q) ||
        (s.ownerEmail || '').toLowerCase().includes(q) ||
        (s.ownerName || '').toLowerCase().includes(q) ||
        (s.vertical || '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [shops, shopSearch])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  function TH({ label, k }: { label: string; k: SortKey }) {
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase cursor-pointer select-none whitespace-nowrap ${sortKey === k ? 'text-od-green' : 'text-charcoal-400'}`}
      >
        {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  if (!authed) return null

  return (
    <div className="min-h-screen bg-warm-50">
      {/* HEADER */}
      <header className="bg-warm-100 border-b border-warm-200 px-6 h-14 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="font-serif text-od-green text-lg">ChairOS</span>
          <span className="text-charcoal-400 text-xs">·</span>
          <span className="text-xs font-bold tracking-widest uppercase text-charcoal-500">Admin</span>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-xs text-charcoal-500 hover:text-charcoal-900 transition-colors"
        >
          ← Dashboard
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 pb-16">

        {/* ── SECTION 1: BUSINESS METRICS ── */}
        <div className="mb-8">
          <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-3">Business Metrics</div>
          {loadingMetrics ? (
            <div className="flex items-center gap-2 text-charcoal-500 text-sm py-4">
              <div className="w-4 h-4 border-2 border-od-green border-t-transparent rounded-full animate-spin" />
              Loading metrics…
            </div>
          ) : metrics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="MRR"
                value={`$${metrics.mrr.toLocaleString()}`}
                sub={metrics.mrrChange !== null
                  ? `${metrics.mrrChange >= 0 ? '▲' : '▼'} ${Math.abs(metrics.mrrChange).toFixed(1)}% vs last month`
                  : undefined}
                highlight
              />
              <MetricCard label="Active Shops" value={metrics.activeShops} sub="Owner-tier, active or trialing" />
              <MetricCard label="Active Solo Barbers" value={metrics.activeSolo} sub="Solo-tier, active or trialing" />
              <MetricCard label="Total Accounts" value={metrics.totalProfiles} />
              <MetricCard label="New Signups" value={metrics.newSignups} sub={`This month · ${metrics.newSignupsWeek} this week`} />
              <MetricCard
                label="Trials vs. Paid"
                value={`${metrics.trialingCount} / ${metrics.paidCount}`}
                sub={metrics.conversionRate !== null ? `${metrics.conversionRate.toFixed(0)}% converted (snapshot)` : 'No subscriptions yet'}
              />
              <MetricCard
                label="Appointments Booked"
                value={metrics.appointmentsWeek}
                sub={`This week · ${metrics.appointmentsMonth} this month`}
              />
              <MetricCard
                label="Client Lock Relationships"
                value={metrics.lockedRelationships}
                sub="Platform-wide, currently locked"
              />
              <MetricCard
                label="Churned This Month"
                value={metrics.churnedCount}
                sub={metrics.churnedCount > 0 ? `$${metrics.revenueLostToChurn}/mo lost` : 'No churn this month'}
              />
              <div className="rounded-xl border border-warm-200 bg-warm-100 p-4">
                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-2">Shops by Vertical</div>
                {Object.keys(metrics.verticalBreakdown).length === 0 ? (
                  <div className="text-charcoal-500 text-sm">No active shops yet</div>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(metrics.verticalBreakdown).map(([vertical, count]) => (
                      <div key={vertical} className="flex items-center justify-between text-xs">
                        <span className="text-charcoal-600 capitalize">{vertical}</span>
                        <span className="font-serif text-charcoal-900">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-warm-200 bg-warm-100 p-4 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-lg font-serif ${healthCounts.critical > 0 ? 'text-red-400' : healthCounts.warning > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {healthCounts.critical > 0 ? healthCounts.critical : healthCounts.warning > 0 ? healthCounts.warning : '✓'}
                  </span>
                  <span className="text-xs text-charcoal-500">
                    {healthCounts.critical > 0 ? 'critical issue' + (healthCounts.critical > 1 ? 's' : '') :
                      healthCounts.warning > 0 ? 'warning' + (healthCounts.warning > 1 ? 's' : '') :
                        'All accounts healthy'}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-[10px] text-green-400">{healthCounts.healthy} healthy</span>
                  <span className="text-[10px] text-yellow-400">{healthCounts.warning} warning</span>
                  <span className="text-[10px] text-red-400">{healthCounts.critical} critical</span>
                </div>
              </div>
              <div className="rounded-xl border border-warm-200 bg-warm-100 p-4 col-span-2 md:col-span-4">
                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-2">Recent Errors (Sentry)</div>
                {metrics.recentErrors.status === 'pending' ? (
                  <div className="text-charcoal-500 text-sm">Pending — {metrics.recentErrors.reason}</div>
                ) : metrics.recentErrors.status === 'error' ? (
                  <div className="text-red-400 text-sm">Could not load from Sentry — {metrics.recentErrors.reason}</div>
                ) : metrics.recentErrors.count === 0 ? (
                  <div className="text-green-400 text-sm">No unresolved errors in the last 24 hours.</div>
                ) : (
                  <div className="space-y-2">
                    {metrics.recentErrors.issues?.map((issue, i) => (
                      <div key={i} className="text-xs border-b border-warm-200 last:border-0 pb-2 last:pb-0">
                        <div className="text-charcoal-900 font-medium">{issue.title}</div>
                        <div className="text-charcoal-500">{issue.culprit} · {issue.count} events · last seen {new Date(issue.lastSeen).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-red-400">Failed to load metrics. Check that your admin session is active.</div>
          )}
        </div>

        {/* ── TAB BAR ── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-warm-200/50 p-1 rounded-xl">
            {(['accounts', 'shops'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase transition-colors ${
                  activeTab === t ? 'bg-warm-100 text-charcoal-900 shadow-sm' : 'text-charcoal-500 hover:text-charcoal-900'
                }`}
              >
                {t === 'accounts'
                  ? `Accounts${!loadingUsers ? ` (${users.length})` : ''}`
                  : `Shops${!loadingShops ? ` (${shops.length})` : ''}`}
              </button>
            ))}
          </div>
          <button
            onClick={rerunHealthChecks}
            disabled={rerunning || loadingUsers}
            className="flex items-center gap-1.5 text-xs font-semibold text-od-green border border-od-green/30 bg-od-green/10 hover:bg-od-green/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {rerunning ? (
              <>
                <div className="w-3 h-3 border-2 border-od-green border-t-transparent rounded-full animate-spin" />
                Re-running…
              </>
            ) : 'Re-run Health Checks'}
          </button>
        </div>

        {/* ── ACCOUNTS TAB ── */}
        {activeTab === 'accounts' && (
          <div className="mb-8">
            <div className="flex flex-wrap gap-2 mb-3">
              <input
                type="text"
                placeholder="Search name, email, shop, or shop code…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 min-w-48 bg-warm-100 border border-warm-200 rounded-lg px-3 py-1.5 text-sm text-charcoal-900 placeholder-charcoal-400 focus:outline-none focus:border-od-green/50"
              />
              <div className="flex gap-1">
                {(['all', 'healthy', 'warning', 'critical'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setHealthFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      healthFilter === f
                        ? f === 'all' ? 'bg-charcoal-700 text-charcoal-100'
                          : f === 'healthy' ? 'bg-green-900 text-green-300'
                            : f === 'warning' ? 'bg-yellow-900 text-yellow-300'
                              : 'bg-red-900 text-red-300'
                        : 'bg-warm-100 border border-warm-200 text-charcoal-500 hover:text-charcoal-900'
                    }`}
                  >
                    {f === 'all' ? 'All' : `${f.charAt(0).toUpperCase() + f.slice(1)} (${healthCounts[f]})`}
                  </button>
                ))}
              </div>
            </div>
            {!loadingUsers && (
              <div className="text-xs text-charcoal-500 mb-2">{filtered.length} of {users.length} accounts</div>
            )}

            {loadingUsers ? (
              <div className="flex items-center gap-2 text-charcoal-500 text-sm py-8 justify-center">
                <div className="w-4 h-4 border-2 border-od-green border-t-transparent rounded-full animate-spin" />
                Loading accounts…
              </div>
            ) : (
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: '700px' }}>
                    <thead>
                      <tr className="border-b border-warm-200 bg-warm-200/30">
                        <TH label="Name / Email" k="full_name" />
                        <TH label="Type" k="role" />
                        <TH label="Signup" k="created_at" />
                        <TH label="Subscription" k="subscription_status" />
                        <TH label="Health" k="health" />
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => (
                        <tr
                          key={u.id}
                          className={`border-b border-warm-200 last:border-0 hover:bg-warm-200/40 transition-colors cursor-pointer ${expandedId === u.id ? 'bg-warm-200/20' : ''}`}
                          onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-charcoal-900">{u.full_name || '—'}</div>
                            <div className="text-xs text-charcoal-500 mt-0.5">{u.email}</div>
                            {u.shop_name && (
                              <div className="text-xs text-charcoal-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span>{u.shop_name}</span>
                                {u.shop_code && (
                                  <span className="font-mono text-[10px] bg-warm-200 px-1 py-0.5 rounded tracking-widest">{u.shop_code}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-charcoal-700 capitalize">{u.role || '—'}</div>
                            {u.plan_type && <div className="text-xs text-charcoal-400 mt-0.5">{u.plan_type} plan</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-charcoal-500 whitespace-nowrap">
                            {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold ${SUB_STATUS_COLOR[u.subscription_status ?? ''] ?? 'text-charcoal-500'}`}>
                              {u.subscription_status ?? 'none'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <HealthBadge status={u.health} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={e => { e.stopPropagation(); setExpandedId(expandedId === u.id ? null : u.id) }}
                              className="text-xs text-charcoal-400 hover:text-od-green transition-colors font-semibold px-2 py-1 rounded"
                            >
                              {expandedId === u.id ? '↑ Hide' : 'View'}
                            </button>
                          </td>
                        </tr>
                      ))}

                      {/* Expanded detail rows — rendered separately to avoid React fragment key issues */}
                      {filtered.map(u => expandedId !== u.id ? null : (
                        <tr key={`${u.id}-detail`} className="border-b border-warm-200 bg-warm-200/20">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-3">
                              <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">User ID</div>
                                <div className="font-mono text-charcoal-600 break-all">{u.id}</div>
                              </div>
                              {u.stripe_subscription_id && (
                                <div>
                                  <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Stripe Sub</div>
                                  <div className="font-mono text-charcoal-600 break-all">{u.stripe_subscription_id}</div>
                                </div>
                              )}
                              {u.shop_name && (
                                <div>
                                  <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Shop</div>
                                  <div className="text-charcoal-700">{u.shop_name}</div>
                                  {u.shop_code && <div className="font-mono text-charcoal-400 text-[10px] mt-0.5">{u.shop_code}</div>}
                                  <div className="font-mono text-charcoal-400 text-[10px] mt-0.5">{u.shop_id}</div>
                                </div>
                              )}
                              <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Health</div>
                                <HealthBadge status={u.health} />
                              </div>
                            </div>
                            {u.health_reasons.length > 0 ? (
                              <div className="mt-2">
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Issues</div>
                                <ul className="space-y-1">
                                  {u.health_reasons.map((r, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-xs">
                                      <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${u.health === 'critical' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                                      <span className="text-charcoal-600">{r}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <div className="text-xs text-green-400 mt-1">All checks passed.</div>
                            )}
                          </td>
                        </tr>
                      ))}

                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-charcoal-500 text-sm">
                            {search || healthFilter !== 'all' ? 'No accounts match your filters.' : 'No accounts found.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SHOPS TAB ── */}
        {activeTab === 'shops' && (
          <div className="mb-8">
            <div className="mb-3">
              <input
                type="text"
                placeholder="Search by shop name, code, vertical, or owner…"
                value={shopSearch}
                onChange={e => setShopSearch(e.target.value)}
                className="w-full bg-warm-100 border border-warm-200 rounded-lg px-3 py-2 text-sm text-charcoal-900 placeholder-charcoal-400 focus:outline-none focus:border-od-green/50"
              />
            </div>
            {!loadingShops && (
              <div className="text-xs text-charcoal-500 mb-2">{filteredShops.length} of {shops.length} shops</div>
            )}

            {loadingShops ? (
              <div className="flex items-center gap-2 text-charcoal-500 text-sm py-8 justify-center">
                <div className="w-4 h-4 border-2 border-od-green border-t-transparent rounded-full animate-spin" />
                Loading shops…
              </div>
            ) : filteredShops.length === 0 ? (
              <div className="bg-warm-100 border border-warm-200 rounded-xl px-4 py-10 text-center text-charcoal-500 text-sm">
                {shopSearch ? 'No shops match your search.' : 'No shops found.'}
              </div>
            ) : (
              <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: '760px' }}>
                    <thead>
                      <tr className="border-b border-warm-200 bg-warm-200/30">
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Name</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Vertical</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Signup Date</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Subscription</th>
                        <th className="px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase text-charcoal-400">Last Active</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShops.map(shop => (
                        <tr
                          key={shop.id}
                          className={`border-b border-warm-200 last:border-0 hover:bg-warm-200/40 transition-colors cursor-pointer ${expandedShopId === shop.id ? 'bg-warm-200/20' : ''}`}
                          onClick={() => setExpandedShopId(expandedShopId === shop.id ? null : shop.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-charcoal-900">{shop.name}</div>
                            {shop.shopCode && (
                              <div className="font-mono text-[10px] text-charcoal-400 mt-0.5 tracking-widest">{shop.shopCode}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-charcoal-700 capitalize">{shop.vertical || '—'}</td>
                          <td className="px-4 py-3 text-xs text-charcoal-500 whitespace-nowrap">
                            {new Date(shop.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold ${SUB_STATUS_COLOR[shop.subscriptionStatus ?? ''] ?? 'text-charcoal-500'}`}>
                              {shop.subscriptionStatus ?? 'none'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-charcoal-500 whitespace-nowrap">
                            {shop.lastActiveAt
                              ? new Date(shop.lastActiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : 'No activity yet'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={e => { e.stopPropagation(); setExpandedShopId(expandedShopId === shop.id ? null : shop.id) }}
                              className="text-xs text-charcoal-400 hover:text-od-green transition-colors font-semibold px-2 py-1 rounded"
                            >
                              {expandedShopId === shop.id ? '↑ Hide' : 'View'}
                            </button>
                          </td>
                        </tr>
                      ))}

                      {/* Read-only shop key numbers — no edit affordance anywhere here by design */}
                      {filteredShops.map(shop => expandedShopId !== shop.id ? null : (
                        <tr key={`${shop.id}-detail`} className="border-b border-warm-200 bg-warm-200/20">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-3">
                              <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Owner</div>
                                <div className="text-charcoal-900 font-medium">{shop.ownerName || '—'}</div>
                                <div className="text-charcoal-500">{shop.ownerEmail || '—'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Appointments (all-time)</div>
                                <div className="font-serif text-lg text-charcoal-900">{shop.appointmentCount}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Revenue (completed)</div>
                                <div className="font-serif text-lg text-charcoal-900">${shop.revenueTotal.toLocaleString()}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Clients</div>
                                <div className="font-serif text-lg text-charcoal-900">{shop.clientCount}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Client Lock Relationships</div>
                                <div className="font-serif text-lg text-charcoal-900">{shop.lockedCount}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-1">Shop ID</div>
                                <div className="font-mono text-charcoal-500 text-[10px] break-all">{shop.id}</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── HEALTH SUMMARY ── */}
        {!loadingUsers && (healthCounts.critical > 0 || healthCounts.warning > 0) && (
          <div className="mb-8">
            <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 mb-3">Health Issues Requiring Attention</div>
            <div className="space-y-2">
              {users
                .filter(u => u.health !== 'healthy')
                .sort((a, b) => (a.health === 'critical' ? -1 : 1))
                .map(u => (
                  <div
                    key={u.id}
                    className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-4 ${
                      u.health === 'critical'
                        ? 'bg-red-950/30 border-red-900/50'
                        : 'bg-yellow-950/20 border-yellow-900/30'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <HealthBadge status={u.health} />
                        <span className="text-sm font-medium text-charcoal-900">{u.full_name || u.email}</span>
                        {u.shop_name && <span className="text-xs text-charcoal-500">· {u.shop_name}</span>}
                      </div>
                      <ul className="space-y-0.5">
                        {u.health_reasons.map((r, i) => (
                          <li key={i} className="text-xs text-charcoal-500">{r}</li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={() => { setActiveTab('accounts'); setExpandedId(u.id) }}
                      className="flex-shrink-0 text-xs font-semibold text-charcoal-400 hover:text-charcoal-900 transition-colors"
                    >
                      View →
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
