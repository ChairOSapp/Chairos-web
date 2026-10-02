'use client'

import { useMemo, useState } from 'react'
import type { AdminShopRow } from './types'

const SUB_STATUS_COLOR: Record<string, string> = {
  active: 'text-green-400',
  trialing: 'text-sky-400',
  past_due: 'text-yellow-400',
  grace_period: 'text-orange-400',
  cancelled: 'text-red-400',
}

// Every shop on the platform. Rows expand for key numbers (revenue, clients,
// locks) — read-only by design.
export default function ShopsTable({ shops, loading, onOpenDetail }: { shops: AdminShopRow[]; loading: boolean; onOpenDetail?: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = shops
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.shopCode || '').toLowerCase().includes(q) ||
        (s.ownerEmail || '').toLowerCase().includes(q) ||
        (s.ownerName || '').toLowerCase().includes(q) ||
        (s.vertical || '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [shops, search])

  return (
    <div>
      <input
        type="text"
        placeholder="Search shops, owners, verticals…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-charcoal-950 border border-charcoal-800 rounded-lg px-3 py-2 text-sm text-charcoal-100 placeholder-charcoal-600 focus:outline-none focus:border-od-green/60 mb-3"
      />
      {!loading && (
        <div className="text-xs text-charcoal-600 mb-2">{filtered.length} of {shops.length} shops</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-charcoal-500 text-sm py-10">
          <div className="w-4 h-4 border-2 border-[#7A8C3A] border-t-transparent rounded-full animate-spin" />
          Loading shops…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-charcoal-800 px-4 py-10 text-center text-charcoal-600 text-sm">
          No shops match.
        </div>
      ) : (
        <div className="rounded-xl border border-charcoal-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '680px' }}>
              <thead>
                <tr className="border-b border-charcoal-800 bg-charcoal-950/60">
                  {['Shop', 'Vertical', 'Subscription', 'Last active'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold tracking-widest uppercase text-charcoal-500 whitespace-nowrap">{h}</th>
                  ))}
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    className={`border-b border-charcoal-800/60 last:border-0 hover:bg-charcoal-800/40 transition-colors cursor-pointer ${expandedId === s.id ? 'bg-charcoal-800/30' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-charcoal-100">{s.name}</div>
                      {s.shopCode && <div className="font-mono text-[10px] text-charcoal-600 mt-0.5 tracking-widest">{s.shopCode}</div>}
                    </td>
                    <td className="px-4 py-3 text-charcoal-300 capitalize">{s.vertical || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${SUB_STATUS_COLOR[s.subscriptionStatus ?? ''] ?? 'text-charcoal-500'}`}>
                        {s.subscriptionStatus ?? 'none'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-charcoal-500 whitespace-nowrap">
                      {s.lastActiveAt
                        ? new Date(s.lastActiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'No activity yet'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-charcoal-600 font-semibold">
                        {expandedId === s.id ? '↑ Hide' : 'View'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.map(s => expandedId !== s.id ? null : (
            <div key={`${s.id}-detail`} className="border-t border-charcoal-800 bg-charcoal-950/60 px-4 py-4">
              {onOpenDetail && (
                <button onClick={() => onOpenDetail(s.id)}
                  className="mb-3 text-xs font-bold text-[#8A9A3B] hover:text-[#a5b84a] transition-colors">
                  Open full dossier →
                </button>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1">Owner</div>
                  <div className="text-charcoal-200 font-medium">{s.ownerName || '—'}</div>
                  <div className="text-charcoal-500">{s.ownerEmail || ''}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1">Appointments</div>
                  <div className="font-serif text-xl text-charcoal-100">{s.appointmentCount}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1">Revenue (completed)</div>
                  <div className="font-serif text-xl text-charcoal-100">${s.revenueTotal.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1">Clients · Locked</div>
                  <div className="font-serif text-xl text-charcoal-100">{s.clientCount} <span className="text-charcoal-600 text-sm">· {s.lockedCount}</span></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
