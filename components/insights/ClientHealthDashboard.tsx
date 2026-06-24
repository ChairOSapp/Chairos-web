'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface Appointment {
  id: string
  date: string
  barber_id: string
  status: string
  client_id?: string | null
}

interface Props {
  appointments: Appointment[]
  periodStart: string
  today: string
  isBarber?: boolean
}

type Bucket = 'healthy' | 'fading' | 'gone_cold'

interface ClientRow {
  clientId: string
  lastVisit: string
  daysSince: number
  totalVisits: number
  isFirstTimer: boolean
  bucket: Bucket
}

export default function ClientHealthDashboard({ appointments, periodStart, today, isBarber }: Props) {
  const router = useRouter()
  const [openBucket, setOpenBucket] = useState<Bucket | null>(null)

  const { rows, firstTimerCount, regularCount } = useMemo(() => {
    const done = appointments.filter(a => a.status === 'done' && a.client_id)
    const map: Record<string, string[]> = {}
    for (const a of done) {
      if (!a.client_id) continue
      if (!map[a.client_id]) map[a.client_id] = []
      map[a.client_id].push(a.date)
    }

    const nowMs = new Date(today + 'T12:00:00').getTime()
    const result: ClientRow[] = []

    for (const [clientId, dates] of Object.entries(map)) {
      const sorted = [...dates].sort()
      const lastVisit = sorted[sorted.length - 1]
      const daysSince = Math.floor((nowMs - new Date(lastVisit + 'T12:00:00').getTime()) / 86400000)
      const isFirstTimer = dates.length === 1
      const bucket: Bucket = daysSince <= 30 ? 'healthy' : daysSince <= 60 ? 'fading' : 'gone_cold'
      result.push({ clientId, lastVisit, daysSince, totalVisits: dates.length, isFirstTimer, bucket })
    }

    const healthy = result.filter(r => r.bucket === 'healthy')
    return {
      rows: result,
      firstTimerCount: healthy.filter(r => r.isFirstTimer).length,
      regularCount: healthy.filter(r => !r.isFirstTimer).length,
    }
  }, [appointments, today])

  const healthy = rows.filter(r => r.bucket === 'healthy')
  const fading = rows.filter(r => r.bucket === 'fading')
  const goneCold = rows.filter(r => r.bucket === 'gone_cold')

  if (rows.length === 0) return null

  const BUCKETS = [
    { key: 'healthy' as Bucket, label: 'Healthy', count: healthy.length, color: 'text-green-400', sub: 'In last 30 days' },
    { key: 'fading' as Bucket, label: 'Fading', count: fading.length, color: 'text-amber-400', sub: '31–60 days out' },
    { key: 'gone_cold' as Bucket, label: 'Gone Cold', count: goneCold.length, color: 'text-charcoal-500', sub: '60+ days — act now' },
  ]

  const bucketMap: Record<Bucket, ClientRow[]> = { healthy, fading, gone_cold: goneCold }

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-warm-200">
        <div className="font-serif text-charcoal-900">Client Health</div>
        <div className="text-xs text-charcoal-500 mt-0.5">
          {firstTimerCount} first-timers · {regularCount} regulars active — tap a bucket to see who
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-warm-200">
        {BUCKETS.map(b => (
          <button
            key={b.key}
            onClick={() => setOpenBucket(openBucket === b.key ? null : b.key)}
            className={`p-4 text-center hover:bg-warm-200/50 transition-colors ${openBucket === b.key ? 'bg-warm-200/60' : ''}`}
          >
            <div className={`font-serif text-2xl mb-1 ${b.color}`}>{b.count}</div>
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-600">{b.label}</div>
            <div className="text-[10px] text-charcoal-400 mt-0.5">{b.sub}</div>
          </button>
        ))}
      </div>

      {openBucket && (
        <div className="border-t border-warm-200">
          <div className="max-h-56 overflow-y-auto divide-y divide-warm-200">
            {bucketMap[openBucket].slice(0, 40).map((c, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-charcoal-500">{c.clientId.slice(0, 8)}…</span>
                  <span className="text-xs text-charcoal-400">{c.totalVisits} cut{c.totalVisits !== 1 ? 's' : ''}</span>
                  {c.isFirstTimer && (
                    <span className="text-[9px] font-bold tracking-widest uppercase text-od-green bg-od-green/10 px-1.5 py-0.5 rounded-full">First-Timer</span>
                  )}
                </div>
                <span className="text-xs text-charcoal-400">{c.daysSince}d ago</span>
              </div>
            ))}
            {bucketMap[openBucket].length === 0 && (
              <div className="px-5 py-5 text-sm text-charcoal-500 text-center">No clients in this bucket.</div>
            )}
          </div>
          {openBucket === 'gone_cold' && !isBarber && goneCold.length > 0 && (
            <div className="px-5 py-3 border-t border-warm-200 bg-warm-200/30">
              <button
                onClick={() => router.push(`/dashboard/campaigns?intent=${encodeURIComponent('Win back gone-cold clients — last visit 60+ days ago')}`)}
                className="text-xs font-semibold text-od-green hover:underline"
              >
                → Create win-back campaign for {goneCold.length} gone-cold clients
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
