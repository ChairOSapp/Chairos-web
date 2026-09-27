'use client'

import { useMemo, useState } from 'react'
import type { AdminUserRow, HealthStatus } from './types'

const SUB_STATUS_COLOR: Record<string, string> = {
  active: 'text-green-400',
  trialing: 'text-sky-400',
  past_due: 'text-yellow-400',
  grace_period: 'text-orange-400',
  cancelled: 'text-red-400',
}

function HealthBadge({ status }: { status: HealthStatus }) {
  const styles: Record<HealthStatus, string> = {
    healthy: 'bg-green-950/60 text-green-300 border-green-900/60',
    warning: 'bg-yellow-950/50 text-yellow-300 border-yellow-900/60',
    critical: 'bg-red-950/60 text-red-300 border-red-900/60',
  }
  const dots: Record<HealthStatus, string> = {
    healthy: 'bg-green-400',
    warning: 'bg-yellow-400',
    critical: 'bg-red-400',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dots[status]}`} />
      {status}
    </span>
  )
}

type SortKey = 'full_name' | 'email' | 'subscription_status' | 'created_at' | 'health'

// Every account on the platform, searchable and filterable by health.
// Rows expand for the full detail (IDs, Stripe sub, shop link, issues).
export default function AccountsTable({ users, loading }: { users: AdminUserRow[]; loading: boolean }) {
  const [search, setSearch] = useState('')
  const [healthFilter, setHealthFilter] = useState<HealthStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const healthCounts = useMemo(() => ({
    healthy: users.filter(u => u.health === 'healthy').length,
    warning: users.filter(u => u.health === 'warning').length,
    critical: users.filter(u => u.health === 'critical').length,
  }), [users])

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
      const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''))
      return sortAsc ? cmp : -cmp
    })
  }, [users, search, sortKey, sortAsc, healthFilter])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  function TH({ label, k }: { label: string; k: SortKey }) {
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase cursor-pointer select-none whitespace-nowrap ${sortKey === k ? 'text-[#8A9A3B]' : 'text-charcoal-500'}`}
      >
        {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          type="text"
          placeholder="Search name, email, shop…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-44 bg-charcoal-950 border border-charcoal-800 rounded-lg px-3 py-2 text-sm text-charcoal-100 placeholder-charcoal-600 focus:outline-none focus:border-od-green/60"
        />
        <div className="flex gap-1.5">
          {(['all', 'healthy', 'warning', 'critical'] as const).map(f => (
            <button
              key={f}
              onClick={() => setHealthFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                healthFilter === f
                  ? 'bg-charcoal-700 text-charcoal-100 border-charcoal-600'
                  : 'bg-charcoal-950 border-charcoal-800 text-charcoal-500 hover:text-charcoal-200'
              }`}
            >
              {f === 'all' ? `All (${users.length})` : `${f} (${healthCounts[f]})`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-charcoal-500 text-sm py-10">
          <div className="w-4 h-4 border-2 border-[#7A8C3A] border-t-transparent rounded-full animate-spin" />
          Loading accounts…
        </div>
      ) : (
        <div className="rounded-xl border border-charcoal-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '680px' }}>
              <thead>
                <tr className="border-b border-charcoal-800 bg-charcoal-950/60">
                  <TH label="Account" k="full_name" />
                  <TH label="Plan" k="subscription_status" />
                  <TH label="Joined" k="created_at" />
                  <TH label="Health" k="health" />
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr
                    key={u.id}
                    onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                    className={`border-b border-charcoal-800/60 last:border-0 hover:bg-charcoal-800/40 transition-colors cursor-pointer ${expandedId === u.id ? 'bg-charcoal-800/30' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-charcoal-100">{u.full_name || '—'}</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">{u.email}</div>
                      {u.shop_name && (
                        <div className="text-xs text-charcoal-600 mt-0.5">
                          {u.shop_name}{u.shop_code ? ` · ${u.shop_code}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${SUB_STATUS_COLOR[u.subscription_status ?? ''] ?? 'text-charcoal-500'}`}>
                        {u.subscription_status ?? 'none'}
                      </span>
                      {u.plan_type && <div className="text-[11px] text-charcoal-600 mt-0.5">{u.plan_type}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal-500 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3"><HealthBadge status={u.health} /></td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-charcoal-600 font-semibold">
                        {expandedId === u.id ? '↑ Hide' : 'View'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-charcoal-600 text-sm">
                      No accounts match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Expanded detail panels render below the table (no nested-row key juggling) */}
          {filtered.map(u => expandedId !== u.id ? null : (
            <div key={`${u.id}-detail`} className="border-t border-charcoal-800 bg-charcoal-950/60 px-4 py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-3">
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1">User ID</div>
                  <div className="font-mono text-charcoal-400 break-all">{u.id}</div>
                </div>
                {u.stripe_subscription_id && (
                  <div>
                    <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1">Stripe sub</div>
                    <div className="font-mono text-charcoal-400 break-all">{u.stripe_subscription_id}</div>
                  </div>
                )}
                {u.shop_id && (
                  <div>
                    <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1">Shop ID</div>
                    <div className="font-mono text-charcoal-400 break-all">{u.shop_id}</div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1">Role</div>
                  <div className="text-charcoal-300 capitalize">{u.role || '—'}</div>
                </div>
              </div>
              {u.health_reasons.length > 0 ? (
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1.5">Why flagged</div>
                  <ul className="space-y-1">
                    {u.health_reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-charcoal-400">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${u.health === 'critical' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-xs text-green-400">All checks passed.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
