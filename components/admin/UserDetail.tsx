'use client'
import { useEffect, useState } from 'react'

interface UserDossier {
  profile: {
    id: string; email: string; full_name: string | null; role: string | null
    plan_type: string | null; subscription_status: string | null
    stripe_customer_id: string | null; stripe_subscription_id: string | null
    trial_end: string | null; created_at: string
  }
  ownedShop: { id: string; name: string; shop_code: string | null; vertical: string | null; created_at: string; rollup: { appointments: number; revenue: number; last30d: number } | null } | null
  employedShop: { id: string; name: string; shop_code: string | null; vertical: string | null; since: string | null } | null
  chair: {
    appointments: number; completed: number; byStatus: Record<string, number>
    revenue: number; last30d: number; distinctClients: number
    lastAppointmentAt: string | null
  }
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
  return `${Math.floor(hrs / 24)}d ago`
}

export default function UserDetail({ userId, onBack, onOpenShop }: {
  userId: string
  onBack: () => void
  onOpenShop: (shopId: string) => void
}) {
  const [data, setData] = useState<UserDossier | null>(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyEmail(email: string) {
    try {
      navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  useEffect(() => {
    setData(null); setError(false)
    fetch(`/api/admin/user/${userId}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true))
  }, [userId])

  if (error) return (
    <div className="rounded-2xl border border-red-900/60 bg-charcoal-900 p-8 text-center">
      <p className="text-red-300 text-sm font-semibold mb-3">Couldn't load this account</p>
      <button onClick={onBack} className="text-xs font-semibold text-charcoal-300 border border-charcoal-700 bg-charcoal-800 hover:bg-charcoal-700 px-4 py-2 rounded-lg">← Back to directory</button>
    </div>
  )
  if (!data) return (
    <div className="flex items-center justify-center gap-2 text-charcoal-500 text-sm py-24">
      <div className="w-5 h-5 border-2 border-[#7A8C3A] border-t-transparent rounded-full animate-spin" />
      Loading account dossier…
    </div>
  )

  const { profile, ownedShop, employedShop, chair } = data

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <button onClick={onBack} className="text-xs font-semibold text-charcoal-400 hover:text-charcoal-100 mb-2">← Back to directory</button>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-serif text-2xl text-charcoal-100">{profile.full_name || '—'}</h2>
          {profile.role && <span className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 bg-charcoal-800 px-2 py-1 rounded-full">{profile.role}</span>}
          {profile.plan_type && <span className="text-[10px] font-bold tracking-widest uppercase text-charcoal-400 bg-charcoal-800 px-2 py-1 rounded-full">{profile.plan_type}</span>}
        </div>
        <p className="text-xs text-charcoal-500 mt-1">{profile.email} · Joined {new Date(profile.created_at).toLocaleDateString()}</p>
      </div>

      {/* Contact — act on what you see */}
      <div className="flex flex-wrap gap-2">
        <a href={`mailto:${profile.email}`}
          className="inline-flex items-center gap-2 text-xs font-bold text-charcoal-100 bg-[#8A9A3B] hover:bg-[#7A8A33] px-4 py-2.5 min-h-[44px] rounded-xl transition-colors">
          ✉ Email {profile.full_name?.split(' ')[0] || 'them'}
        </a>
        <button onClick={() => copyEmail(profile.email)}
          className="inline-flex items-center gap-2 text-xs font-bold text-charcoal-300 border border-charcoal-700 bg-charcoal-800 hover:bg-charcoal-700 px-4 py-2.5 min-h-[44px] rounded-xl transition-colors">
          {copied ? '✓ Copied' : '⧉ Copy email'}
        </button>
      </div>

      {/* Billing */}
      <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-3">Billing</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-charcoal-600 mb-1">Subscription</div>
            <div className={`font-semibold ${profile.subscription_status === 'active' ? 'text-green-400' : 'text-amber-400'}`}>
              {profile.subscription_status || 'none'}
            </div>
          </div>
          <div>
            <div className="text-charcoal-600 mb-1">Trial ends</div>
            <div className="text-charcoal-300">{profile.trial_end ? new Date(profile.trial_end).toLocaleDateString() : '—'}</div>
          </div>
          <div>
            <div className="text-charcoal-600 mb-1">Stripe customer</div>
            <div className="text-charcoal-500 font-mono text-[10px] break-all">{profile.stripe_customer_id || '—'}</div>
          </div>
          <div>
            <div className="text-charcoal-600 mb-1">Stripe subscription</div>
            <div className="text-charcoal-500 font-mono text-[10px] break-all">{profile.stripe_subscription_id || '—'}</div>
          </div>
        </div>
      </div>

      {/* Shops */}
      {(ownedShop || employedShop) && (
        <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-3">Shops</div>
          <div className="space-y-2">
            {ownedShop && (
              <button onClick={() => onOpenShop(ownedShop.id)}
                className="w-full text-left rounded-xl border border-charcoal-800 bg-charcoal-950/60 px-4 py-3 hover:border-[#8A9A3B]/50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600">Owns</div>
                    <div className="text-sm font-semibold text-charcoal-100">{ownedShop.name}</div>
                    {ownedShop.rollup && (
                      <div className="text-[11px] text-charcoal-500 mt-0.5">
                        {ownedShop.rollup.appointments} appts · ${ownedShop.rollup.revenue.toLocaleString()} revenue · {ownedShop.rollup.last30d} in last 30d
                      </div>
                    )}
                  </div>
                  <span className="text-charcoal-500 text-lg">→</span>
                </div>
              </button>
            )}
            {employedShop && (
              <button onClick={() => onOpenShop(employedShop.id)}
                className="w-full text-left rounded-xl border border-charcoal-800 bg-charcoal-950/60 px-4 py-3 hover:border-[#8A9A3B]/50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600">Works at</div>
                    <div className="text-sm font-semibold text-charcoal-100">{employedShop.name}</div>
                    <div className="text-[11px] text-charcoal-500 mt-0.5">Since {employedShop.since ? new Date(employedShop.since).toLocaleDateString() : '—'}</div>
                  </div>
                  <span className="text-charcoal-500 text-lg">→</span>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chair performance */}
      <div>
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-2">Chair performance</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Revenue" value={`$${chair.revenue.toLocaleString()}`} sub={`${chair.completed} completed`} />
          <Stat label="Appointments" value={String(chair.appointments)} sub={`${chair.last30d} in last 30d`} />
          <Stat label="Clients served" value={String(chair.distinctClients)} sub="distinct" />
          <Stat label="Last booking" value={timeAgo(chair.lastAppointmentAt)} sub=" " />
        </div>
      </div>

      {/* Status breakdown */}
      {Object.keys(chair.byStatus).length > 0 && (
        <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-3">Appointments by status</div>
          {Object.entries(chair.byStatus).sort((a, b) => b[1] - a[1]).map(([s, c]) => (
            <div key={s} className="flex items-center justify-between py-1.5 border-b border-charcoal-800/50 last:border-0">
              <span className="text-xs text-charcoal-300 capitalize">{s}</span>
              <span className="text-xs font-semibold text-charcoal-100 font-mono">{c}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] text-charcoal-600 font-mono break-all">Account ID: {profile.id}</div>
    </div>
  )
}
