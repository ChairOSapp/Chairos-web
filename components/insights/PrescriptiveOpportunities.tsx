'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'
import { buildCampaignHref } from '@/lib/campaignHref'

// Prescriptive "opportunity" insights: tell the owner what to DO, not just
// what happened. All heuristics are computed client-side from shop-scoped
// data — no LLM, stays fast.

interface ShopHoursEntry {
  day: string
  open: boolean
  from: string
  to: string
}

interface Props {
  shopId: string
  shopHours: ShopHoursEntry[] | null
  barbers: { barber_id: string; barber_name: string }[]
}

interface HistAppt {
  id: string
  date: string
  time: string
  price: number | string | null
  barber_id: string | null
  client_id: string | null
  status: string
  created_at: string
  services: { duration_minutes?: number | null } | Array<{ duration_minutes?: number | null }> | null
}

function apptDuration(a: HistAppt): number {
  const s = a.services
  const obj = Array.isArray(s) ? s[0] : s
  return obj?.duration_minutes || 30
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BLOCKING_DONE = ['done', 'completed']
const OCCUPYING = ['pending', 'confirmed', 'done', 'completed', 'noshow']

function fmt(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function toMin(hm: string) {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + (m || 0)
}
function median(nums: number[]) {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
function money(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}
function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function hourLabel(h: number) {
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}${ampm}`
}

export default function PrescriptiveOpportunities({ shopId, shopHours, barbers }: Props) {
  const router = useRouter()
  const { staffLabel } = useVerticalLabels()
  const [hist, setHist] = useState<HistAppt[]>([])
  const [upcoming, setUpcoming] = useState<HistAppt[]>([])
  const [clientNames, setClientNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!shopId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const supabase = createClient()
        const now = new Date()
        const today = fmt(now)
        const past = fmt(new Date(now.getTime() - 120 * 86400000))
        const future = fmt(new Date(now.getTime() + 14 * 86400000))
        const sel = 'id,date,time,price,barber_id,client_id,status,created_at,services(duration_minutes)'
        const [histRes, upRes] = await Promise.all([
          supabase.from('appointments').select(sel).eq('shop_id', shopId).gte('date', past).lt('date', today).order('date', { ascending: true }),
          supabase.from('appointments').select(sel).eq('shop_id', shopId).gte('date', today).lte('date', future).order('date', { ascending: true }),
        ])
        if (cancelled) return
        const h = (histRes.data || []) as HistAppt[]
        const u = (upRes.data || []) as HistAppt[]
        setHist(h)
        setUpcoming(u)
        const ids = Array.from(new Set([...h, ...u].map(a => a.client_id).filter(Boolean))) as string[]
        if (ids.length > 0) {
          // chunk to stay under URL limits
          const map: Record<string, string> = {}
          for (let i = 0; i < ids.length; i += 200) {
            const { data } = await supabase.from('clients').select('id, full_name').in('id', ids.slice(i, i + 200))
            for (const c of (data || []) as { id: string; full_name: string | null }[]) {
              map[c.id] = c.full_name || 'Client'
            }
          }
          if (!cancelled) setClientNames(map)
        }
      } catch {
        // degrade: cards render empty states
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [shopId])

  const hoursFor = (dateStr: string): { openMin: number; closeMin: number; estimated: boolean } | null => {
    const dayName = DAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()]
    const entry = (shopHours || []).find(h => h.day === dayName)
    if (entry && entry.open && entry.from && entry.to) {
      return { openMin: toMin(entry.from), closeMin: toMin(entry.to), estimated: false }
    }
    if (entry && !entry.open) return null
    // graceful fallback: assume Mon–Sat 9–5 when hours aren't configured
    const dow = new Date(dateStr + 'T12:00:00').getDay()
    if (dow === 0) return null
    return { openMin: 9 * 60, closeMin: 17 * 60, estimated: true }
  }

  const numBarbers = Math.max(barbers.filter(b => b.barber_id).length, 1)

  // ---------- Card 1: money left on the table ----------
  const moneyCard = useMemo(() => {
    const done90 = hist.filter(a => BLOCKING_DONE.includes(a.status) && a.price != null)
    const tickets = done90.map(a => Number(a.price)).filter(n => n > 0)
    if (tickets.length === 0) return null
    const avgTicket = tickets.reduce((s, n) => s + n, 0) / tickets.length
    const now = new Date()
    let openSlots = 0
    let estimated = false
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getTime() + i * 86400000)
      const ds = fmt(d)
      const hrs = hoursFor(ds)
      if (!hrs) continue
      if (hrs.estimated) estimated = true
      const starts: number[] = []
      for (let t = hrs.openMin; t + 30 <= hrs.closeMin; t += 30) starts.push(t)
      const capacity = starts.length * numBarbers
      const booked = upcoming
        .filter(a => a.date === ds && OCCUPYING.includes(a.status))
        .reduce((s, a) => s + Math.ceil(apptDuration(a) / 30), 0)
      openSlots += Math.max(0, capacity - booked)
    }
    return { amount: openSlots * avgTicket, openSlots, estimated }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist, upcoming, numBarbers, shopHours])

  // ---------- Card 2: quiet clients ----------
  const quietClients = useMemo(() => {
    const byClient: Record<string, string[]> = {}
    for (const a of hist) {
      if (!a.client_id || !BLOCKING_DONE.includes(a.status)) continue
      if (!byClient[a.client_id]) byClient[a.client_id] = []
      byClient[a.client_id].push(a.date)
    }
    const nowMs = new Date(fmt(new Date()) + 'T12:00:00').getTime()
    const out: { id: string; name: string; overdueDays: number; interval: number }[] = []
    for (const [cid, dates] of Object.entries(byClient)) {
      if (dates.length < 2) continue
      const sorted = [...new Set(dates)].sort()
      const gaps: number[] = []
      for (let i = 1; i < sorted.length; i++) {
        gaps.push((new Date(sorted[i] + 'T12:00:00').getTime() - new Date(sorted[i - 1] + 'T12:00:00').getTime()) / 86400000)
      }
      const interval = Math.round(median(gaps))
      if (interval <= 0) continue
      const lastMs = new Date(sorted[sorted.length - 1] + 'T12:00:00').getTime()
      const overdueDays = Math.floor((nowMs - lastMs) / 86400000) - interval
      if (overdueDays > 0) out.push({ id: cid, name: clientNames[cid] || 'Client', overdueDays, interval })
    }
    return out.sort((a, b) => b.overdueDays - a.overdueDays).slice(0, 8)
  }, [hist, clientNames])

  // ---------- Card 3: dead hours ----------
  const deadHours = useMemo(() => {
    const now = new Date()
    const start28 = fmt(new Date(now.getTime() - 28 * 86400000))
    const recent = hist.filter(a => a.date >= start28 && OCCUPYING.includes(a.status))
    // weekday occurrences in window
    const dowCount: Record<number, number> = {}
    for (let i = 0; i < 28; i++) {
      const dow = new Date(now.getTime() - i * 86400000).getDay()
      dowCount[dow] = (dowCount[dow] || 0) + 1
    }
    const booked: Record<string, number> = {}
    for (const a of recent) {
      const dow = new Date(a.date + 'T12:00:00').getDay()
      const h = parseInt(a.time.split(':')[0], 10)
      const key = `${dow}-${h}`
      booked[key] = (booked[key] || 0) + 1
    }
    const out: { dow: number; hour: number; util: number }[] = []
    for (let dow = 0; dow < 7; dow++) {
      const dayName = DAY_NAMES[dow]
      const entry = (shopHours || []).find(x => x.day === dayName)
      const openMin = entry && entry.open ? toMin(entry.from) : 9 * 60
      const closeMin = entry && entry.open ? toMin(entry.to) : 17 * 60
      if (entry && !entry.open) continue
      for (let h = Math.floor(openMin / 60); h < Math.ceil(closeMin / 60); h++) {
        const capacity = (dowCount[dow] || 0) * numBarbers * 2 // 30-min slots per hour
        if (capacity < 8) continue // not enough sample
        const util = (booked[`${dow}-${h}`] || 0) / capacity
        if (util < 0.3) out.push({ dow, hour: h, util })
      }
    }
    return out.sort((a, b) => a.util - b.util).slice(0, 3)
  }, [hist, numBarbers, shopHours])

  // ---------- Card 4: no-show risk ----------
  const risky = useMemo(() => {
    const now = new Date()
    const weekOut = fmt(new Date(now.getTime() + 7 * 86400000))
    const today = fmt(now)
    // client stats from history
    const stats: Record<string, { ns: number; total: number }> = {}
    for (const a of hist) {
      if (!a.client_id) continue
      if (!['done', 'completed', 'noshow'].includes(a.status)) continue
      const s = stats[a.client_id] || { ns: 0, total: 0 }
      s.total++
      if (a.status === 'noshow') s.ns++
      stats[a.client_id] = s
    }
    // slot flakiness by weekday-hour
    const slot: Record<string, { ns: number; total: number }> = {}
    for (const a of hist) {
      if (!['done', 'completed', 'noshow'].includes(a.status)) continue
      const dow = new Date(a.date + 'T12:00:00').getDay()
      const h = parseInt(a.time.split(':')[0], 10)
      const key = `${dow}-${h}`
      const s = slot[key] || { ns: 0, total: 0 }
      s.total++
      if (a.status === 'noshow') s.ns++
      slot[key] = s
    }
    const out: { id: string; name: string; date: string; time: string; score: number; level: string }[] = []
    for (const a of upcoming) {
      if (a.date < today || a.date > weekOut) continue
      if (!['pending', 'confirmed'].includes(a.status) || !a.client_id) continue
      const st = stats[a.client_id]
      const clientRate = st && st.total >= 2 ? st.ns / st.total : 0
      const leadDays = Math.max(0, (new Date(a.date + 'T12:00:00').getTime() - new Date(a.created_at).getTime()) / 86400000)
      const leadRisk = leadDays < 1 ? 1 : leadDays < 3 ? 0.5 : 0
      const dow = new Date(a.date + 'T12:00:00').getDay()
      const h = parseInt(a.time.split(':')[0], 10)
      const sl = slot[`${dow}-${h}`]
      const slotRate = sl && sl.total >= 3 ? sl.ns / sl.total : 0
      const score = 0.6 * clientRate + 0.25 * leadRisk + 0.15 * slotRate
      const level = score >= 0.5 ? 'High' : score >= 0.3 ? 'Medium' : 'Low'
      out.push({ id: a.id, name: clientNames[a.client_id] || 'Client', date: a.date, time: a.time.slice(0, 5), score, level })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 5)
  }, [hist, upcoming, clientNames])

  if (!shopId) return null

  return (
    <div className="mb-6">
      <div className="font-serif text-2xl text-charcoal-900">Opportunities</div>
      <p className="text-sm text-charcoal-500 mb-4">What your data says to do next.</p>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Card 1 — money left on the table */}
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Open slots · next 14 days</div>
            {moneyCard ? (
              <>
                <div className="font-serif text-3xl text-charcoal-900 mb-1">{money(moneyCard.amount)}</div>
                <p className="text-sm text-charcoal-900 mb-3">
                  ≈{moneyCard.openSlots} open {staffLabel} slots going unfilled — worth up to {money(moneyCard.amount)} if every slot fills.
                  {moneyCard.estimated && <span className="text-charcoal-500"> (Estimated — set shop hours in Settings for precision.)</span>}
                </p>
                <button onClick={() => router.push(buildCampaignHref({
                  intent: 'Fill open slots over the next 2 weeks',
                  title: 'Fill open slots',
                  audience: 'all_clients',
                }))} className="btn-chairos">
                  Fill them
                </button>
              </>
            ) : (
              <p className="text-sm text-charcoal-900">Not enough booking history yet to estimate this.</p>
            )}
          </div>

          {/* Card 2 — quiet clients */}
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Quiet clients</div>
            {quietClients.length > 0 ? (
              <>
                <ul className="mb-3 space-y-1.5">
                  {quietClients.map(c => (
                    <li key={c.id} className="text-sm text-charcoal-900">
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-charcoal-500"> — {c.overdueDays}d overdue (usually every ~{c.interval}d)</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => router.push(buildCampaignHref({
                  intent: `Win back ${quietClients.length} quiet clients`,
                  title: 'Win back quiet clients',
                  clientIds: quietClients.map(c => c.id),
                }))} className="btn-chairos">
                  Win back
                </button>
              </>
            ) : (
              <p className="text-sm text-charcoal-900">Everyone&apos;s on schedule — nice.</p>
            )}
          </div>

          {/* Card 3 — dead hours */}
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Dead hours · last 4 weeks</div>
            {deadHours.length > 0 ? (
              <>
                <ul className="mb-3 space-y-1.5">
                  {deadHours.map(d => (
                    <li key={`${d.dow}-${d.hour}`} className="text-sm text-charcoal-900">
                      <span className="font-semibold">{SHORT_DAYS[d.dow]}s {hourLabel(d.hour)}–{hourLabel(d.hour + 1)}</span>
                      <span className="text-charcoal-500"> — running at {Math.round(d.util * 100)}% full</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => router.push(buildCampaignHref({
                    intent: `Fill dead hours: ${deadHours.map(d => `${SHORT_DAYS[d.dow]} ${hourLabel(d.hour)}`).join(', ')}`,
                    title: 'Dead-hours promo',
                    audience: 'all_clients',
                  }))}
                  className="btn-chairos"
                >
                  Create promo
                </button>
              </>
            ) : (
              <p className="text-sm text-charcoal-900">No dead hours — your schedule is healthy.</p>
            )}
          </div>

          {/* Card 4 — no-show risk */}
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-4">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">No-show risk · next 7 days</div>
            {risky.length > 0 ? (
              <ul className="space-y-1.5">
                {risky.map(r => (
                  <li key={r.id} className="text-sm text-charcoal-900 flex items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold">{r.name}</span>
                      <span className="text-charcoal-500"> — {dayLabel(r.date)} {r.time}</span>
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      r.level === 'High' ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                      : r.level === 'Medium' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      : 'bg-od-green/10 text-od-green border border-od-green/20'
                    }`}>
                      {r.level} risk
                    </span>
                  </li>
                ))}
                <p className="text-xs text-charcoal-500 pt-1">Nudge: send a confirmation text the day before.</p>
              </ul>
            ) : (
              <p className="text-sm text-charcoal-900">No at-risk bookings — nice.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
