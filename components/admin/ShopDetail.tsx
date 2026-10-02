'use client'
import { useEffect, useState } from 'react'

interface ChairRow {
  barber_id: string
  full_name: string | null
  email: string | null
  active: boolean
  since: string
  appointments: number
  completed: number
  revenue: number
  last30d: number
}

interface ShopDossier {
  shop: { id: string; name: string; vertical: string | null; shop_code: string | null; slug: string | null; city: string | null; state: string | null; created_at: string }
  owner: { id: string; email: string; full_name: string | null; plan_type: string | null; subscription_status: string | null } | null
  chairs: ChairRow[]
  stats: {
    appointments: number; completed: number; byStatus: Record<string, number>
    revenueTotal: number; byPaymentMethod: Record<string, number>
    last30d: number; last30dRevenue: number
    weekly: { week: string; appointments: number; revenue: number }[]
    clients: number; locked: number; services: number
    lastAppointmentAt: string | null
  }
  integrations: { squareConnected: boolean; lastAutomationAt: string | null }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-charcoal-800 bg-charcoal-950/60 px-4 py-3">
      <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-1">{label}</div>
      <div className="font-serif text-2xl text-charcoal-100">{value}</div>
      {sub && <div className="text-[11px] text-charcoal-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function ShopDetail({ shopId, onBack, onOpenUser }: {
  shopId: string
  onBack: () => void
  onOpenUser: (userId: string) => void
}) {
  const [data, setData] = useState<ShopDossier | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setData(null); setError(false)
    fetch(`/api/admin/shop/${shopId}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true))
  }, [shopId])

  if (error) return (
    <div className="rounded-2xl border border-red-900/60 bg-charcoal-900 p-8 text-center">
      <p className="text-red-300 text-sm font-semibold mb-3">Couldn't load this shop</p>
      <button onClick={onBack} className="text-xs font-semibold text-charcoal-300 border border-charcoal-700 bg-charcoal-800 hover:bg-charcoal-700 px-4 py-2 rounded-lg">← Back to directory</button>
    </div>
  )
  if (!data) return (
    <div className="flex items-center justify-center gap-2 text-charcoal-500 text-sm py-24">
      <div className="w-5 h-5 border-2 border-[#7A8C3A] border-t-transparent rounded-full animate-spin" />
      Loading shop dossier…
    </div>
  )

  const { shop, owner, chairs, stats, integrations } = data
  const maxWeek = Math.max(1, ...stats.weekly.map(w => w.appointments))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <button onClick={onBack} className="text-xs font-semibold text-charcoal-400 hover:text-charcoal-100 mb-2">← Back to directory</button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-serif text-2xl text-charcoal-100">{shop.name}</h2>
            {shop.vertical && <span className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 bg-charcoal-800 px-2 py-1 rounded-full">{shop.vertical}</span>}
            {shop.shop_code && <span className="text-[11px] font-mono text-charcoal-500">{shop.shop_code}</span>}
          </div>
          <p className="text-xs text-charcoal-500 mt-1">
            Opened {new Date(shop.created_at).toLocaleDateString()} · Last booking {timeAgo(stats.lastAppointmentAt)}
          </p>
        </div>
      </div>

      {/* Owner */}
      {owner && (
        <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-2">Owner</div>
          <button onClick={() => onOpenUser(owner.id)} className="text-left group">
            <div className="text-sm font-semibold text-charcoal-100 group-hover:text-[#8A9A3B] transition-colors">{owner.full_name || '—'}</div>
            <div className="text-xs text-charcoal-500">{owner.email}</div>
          </button>
          <div className="flex gap-2 mt-2">
            {owner.plan_type && <span className="text-[10px] font-bold uppercase tracking-wider bg-charcoal-800 text-charcoal-300 px-2 py-0.5 rounded-full">{owner.plan_type}</span>}
            {owner.subscription_status && <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${owner.subscription_status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>{owner.subscription_status}</span>}
          </div>
        </div>
      )}

      {/* Vitals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Revenue (all time)" value={`$${stats.revenueTotal.toLocaleString()}`} sub={`${stats.completed} completed appts`} />
        <Stat label="Last 30 days" value={`$${stats.last30dRevenue.toLocaleString()}`} sub={`${stats.last30d} appointments`} />
        <Stat label="Clients" value={String(stats.clients)} sub={`${stats.locked} locked`} />
        <Stat label="Chairs" value={String(chairs.length)} sub={`${chairs.filter(c => c.active).length} active`} />
      </div>

      {/* 8-week trend */}
      <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-3">8-week volume</div>
        <div className="flex items-end gap-1.5 h-24">
          {stats.weekly.map(w => (
            <div key={w.week} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${w.week}: ${w.appointments} appts · $${w.revenue}`}>
              <div className="w-full rounded-t bg-[#8A9A3B]/70 hover:bg-[#8A9A3B] transition-colors" style={{ height: `${Math.max(4, (w.appointments / maxWeek) * 100)}%` }} />
              <div className="text-[9px] text-charcoal-600">{w.week.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment mix + status */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-3">Revenue by payment method</div>
          {Object.keys(stats.byPaymentMethod).length === 0 && <p className="text-xs text-charcoal-600">No completed payments yet.</p>}
          {Object.entries(stats.byPaymentMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => (
            <div key={m} className="flex items-center justify-between py-1.5 border-b border-charcoal-800/50 last:border-0">
              <span className="text-xs text-charcoal-300 capitalize">{m}</span>
              <span className="text-xs font-semibold text-charcoal-100 font-mono">${v.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-3">Appointments by status</div>
          {Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1]).map(([s, c]) => (
            <div key={s} className="flex items-center justify-between py-1.5 border-b border-charcoal-800/50 last:border-0">
              <span className="text-xs text-charcoal-300 capitalize">{s}</span>
              <span className="text-xs font-semibold text-charcoal-100 font-mono">{c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chairs */}
      <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-3">Chairs ({chairs.length})</div>
        {chairs.length === 0 && <p className="text-xs text-charcoal-600">No chairs linked yet.</p>}
        <div className="space-y-2">
          {chairs.map(c => (
            <button key={c.barber_id} onClick={() => onOpenUser(c.barber_id)}
              className="w-full text-left rounded-xl border border-charcoal-800 bg-charcoal-950/60 px-4 py-3 hover:border-[#8A9A3B]/50 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-charcoal-100 truncate">{c.full_name || c.email || '—'}</div>
                  <div className="text-[11px] text-charcoal-500">{c.active ? 'Active' : 'Inactive'} · {c.appointments} appts · {c.last30d} in last 30d</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-serif text-lg text-charcoal-100">${c.revenue.toLocaleString()}</div>
                  <div className="text-[10px] text-charcoal-600">lifetime revenue</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Integrations */}
      <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-3">Integrations & automation</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-charcoal-600 mb-1">Square</div>
            <div className={integrations.squareConnected ? 'text-green-400 font-semibold' : 'text-charcoal-500'}>
              {integrations.squareConnected ? 'Connected' : 'Not connected'}
            </div>
          </div>
          <div>
            <div className="text-charcoal-600 mb-1">Last automation</div>
            <div className="text-charcoal-300">{timeAgo(integrations.lastAutomationAt)}</div>
          </div>
          <div>
            <div className="text-charcoal-600 mb-1">Services</div>
            <div className="text-charcoal-300">{stats.services}</div>
          </div>
          <div>
            <div className="text-charcoal-600 mb-1">Shop ID</div>
            <div className="text-charcoal-500 font-mono text-[10px] break-all">{shop.id}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
