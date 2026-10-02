'use client'
import { useEffect, useState } from 'react'

interface UserDossier {
  profile: {
    id: string; email: string; full_name: string | null; role: string | null
    plan_type: string | null; subscription_status: string | null
    stripe_customer_id: string | null; stripe_subscription_id: string | null
    trial_end: string | null; created_at: string
    phone: string | null; sms_consent: boolean; sms_consent_at: string | null
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

interface OutreachEntry {
  id: string; created_at: string; channel: string
  subject: string | null; body_preview: string; success: boolean
}

function OutreachCompose({ profile }: { profile: UserDossier['profile'] }) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [subject, setSubject] = useState('')
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [log, setLog] = useState<OutreachEntry[]>([])

  const smsReady = !!(profile.phone && profile.sms_consent)

  useEffect(() => {
    fetch(`/api/admin/contact?userId=${profile.id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setLog(d?.log ?? []))
      .catch(() => {})
  }, [profile.id])

  async function send() {
    if (sending) return
    setSending(true); setResult(null)
    try {
      const r = await fetch('/api/admin/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id, channel,
          subject: channel === 'email' ? subject : undefined,
          body: msg,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        setResult({ ok: true, text: channel === 'email' ? 'Email sent.' : 'Text sent.' })
        setMsg(''); setSubject('')
        const lr = await fetch(`/api/admin/contact?userId=${profile.id}`)
        const ld = await lr.json().catch(() => null)
        setLog(ld?.log ?? [])
      } else {
        setResult({ ok: false, text: d.error || 'Send failed.' })
      }
    } catch {
      setResult({ ok: false, text: 'Send failed — check your connection.' })
    }
    setSending(false)
  }

  const canSend = channel === 'email'
    ? msg.trim().length > 0 && subject.trim().length > 0 && !sending
    : smsReady && msg.trim().length > 0 && !sending

  return (
    <div className="rounded-2xl border border-charcoal-800 bg-charcoal-900 p-4 md:p-5">
      <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-charcoal-500 mb-3">Reach out</div>
      <div className="flex gap-1.5 bg-charcoal-950 p-1 rounded-xl mb-3 w-fit">
        {(['email', 'sms'] as const).map(ch => {
          const disabled = ch === 'sms' && !smsReady
          return (
            <button key={ch} onClick={() => !disabled && setChannel(ch)} disabled={disabled}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-widest uppercase transition-colors ${
                channel === ch ? 'bg-charcoal-700 text-charcoal-100'
                : disabled ? 'text-charcoal-700 cursor-not-allowed' : 'text-charcoal-500 hover:text-charcoal-200'
              }`}>
              {ch === 'email' ? '✉ Email' : '✆ Text'}
            </button>
          )
        })}
      </div>
      {channel === 'sms' && !smsReady && (
        <p className="text-xs text-amber-400 mb-3">
          {profile.phone ? 'No SMS consent on file — ask them to opt in first.' : 'No mobile number on file for this account.'}
        </p>
      )}
      {channel === 'email' && (
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
          className="w-full bg-charcoal-950 border border-charcoal-800 rounded-xl px-4 py-2.5 text-sm text-charcoal-100 placeholder:text-charcoal-600 mb-2 focus:outline-none focus:border-[#7A8C3A]" />
      )}
      <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4}
        placeholder={channel === 'email' ? 'Write the email…' : 'Write the text…'}
        className="w-full bg-charcoal-950 border border-charcoal-800 rounded-xl px-4 py-2.5 text-sm text-charcoal-100 placeholder:text-charcoal-600 focus:outline-none focus:border-[#7A8C3A]" />
      <div className="flex items-center gap-3 mt-3">
        <button onClick={send} disabled={!canSend}
          className="text-xs font-bold text-charcoal-950 bg-[#8A9A3B] hover:bg-[#7A8A33] disabled:opacity-40 px-5 py-2.5 min-h-[44px] rounded-xl transition-colors">
          {sending ? 'Sending…' : channel === 'email' ? 'Send email' : 'Send text'}
        </button>
        {result && (
          <span className={`text-xs font-semibold ${result.ok ? 'text-green-400' : 'text-red-300'}`}>
            {result.ok ? '✓ ' : '✕ '}{result.text}
          </span>
        )}
      </div>
      {log.length > 0 && (
        <div className="mt-4 pt-3 border-t border-charcoal-800">
          <div className="text-[10px] font-bold tracking-widest uppercase text-charcoal-600 mb-2">Recent outreach</div>
          <div className="space-y-1.5">
            {log.map(e => (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <span className={e.success ? 'text-green-400' : 'text-red-400'}>{e.success ? '✓' : '✕'}</span>
                <span className="text-charcoal-500">{e.channel === 'email' ? '✉' : '✆'}</span>
                <span className="text-charcoal-400 flex-1 truncate">{e.subject || e.body_preview}</span>
                <span className="text-charcoal-600 whitespace-nowrap">{timeAgo(e.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
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

      <OutreachCompose profile={profile} />
      <div className="flex flex-wrap gap-2 -mt-3">
        <a href={`mailto:${profile.email}`} className="text-xs text-charcoal-500 underline underline-offset-2">
          Open in my mail app instead
        </a>
        <button onClick={() => copyEmail(profile.email)} className="text-xs text-charcoal-500 underline underline-offset-2">
          {copied ? '✓ Email copied' : 'Copy email'}
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
