'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

// Hours 8am–7pm (8..19 inclusive) = 12 hours
const HOUR_LABELS = Array.from({ length: 12 }, (_, i) => {
  const h = i + 8
  return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
})

// Mon–Sun
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  shopId: string
  period: string
}

function getPeriodStart(period: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7); return fmt(d)
  }
  if (period === 'month') {
    const d = new Date(now); d.setDate(d.getDate() - 30); return fmt(d)
  }
  if (period === 'quarter') {
    const d = new Date(now); d.setDate(d.getDate() - 90); return fmt(d)
  }
  if (period === 'year') {
    return `${now.getFullYear()}-01-01`
  }
  // default: last 30 days
  const d = new Date(now); d.setDate(d.getDate() - 30); return fmt(d)
}

interface HoveredCell { day: number; hour: number }

export default function PeakHoursHeatmap({ shopId, period }: Props) {
  const [grid, setGrid] = useState<number[][]>(Array.from({ length: 7 }, () => Array(12).fill(0)))
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState<HoveredCell | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!shopId) return
    async function load() {
      try {
        setLoading(true)
        const periodStart = getPeriodStart(period)
        const { data } = await supabase
          .from('appointments')
          .select('date, time')
          .eq('shop_id', shopId)
          .in('status', ['done', 'completed'])
          .gte('date', periodStart)

        const newGrid: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0))
        for (const a of (data || [])) {
          if (!a.time) continue
          const d = new Date(a.date + 'T12:00:00')
          // 0=Sun in JS, convert to 0=Mon..6=Sun
          const dayIndex = (d.getDay() + 6) % 7
          const hour = parseInt(String(a.time).split(':')[0], 10)
          const col = hour - 8
          if (col >= 0 && col < 12) newGrid[dayIndex][col]++
        }
        setGrid(newGrid)
      } catch {
        // never throw
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [shopId, period])

  const flatValues = grid.flat()
  const maxCount = Math.max(...flatValues, 1)
  const hasData = flatValues.some(v => v > 0)

  // Find busiest cell
  const { busiestDay, busiestHour, busiestCount, slowestDay, slowestHour } = useMemo(() => {
    let busiestDay = 0, busiestHour = 0, busiestCount = 0
    let slowestDay = -1, slowestHour = -1, slowestCount = Infinity
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 12; h++) {
        const c = grid[d][h]
        if (c > busiestCount) { busiestCount = c; busiestDay = d; busiestHour = h }
        if (c > 0 && c < slowestCount) { slowestCount = c; slowestDay = d; slowestHour = h }
      }
    }
    return { busiestDay, busiestHour, busiestCount, slowestDay, slowestHour }
  }, [grid])

  const busiestDayName = DAY_LABELS[busiestDay]
  const slowestDayName = slowestDay >= 0 ? DAY_LABELS[slowestDay] : null
  const fillDayIntent = `Fill ${busiestDayName} appointment slots with a targeted promo`

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-warm-200">
        <div className="font-serif text-charcoal-900">Peak Hours</div>
        <div className="text-xs text-charcoal-500 mt-0.5">When your chair is busiest — darker = more cuts</div>
      </div>
      <div className="p-4 overflow-x-auto lg:overflow-visible">
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <div className="w-5 h-5 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
          </div>
        ) : !hasData ? (
          <div className="text-sm text-charcoal-400 text-center py-4">No time data recorded yet.</div>
        ) : (
          <div style={{ minWidth: '440px' }}>
            {/* Hour labels across top */}
            <div className="flex mb-1 pl-10">
              {HOUR_LABELS.map((h, i) => (
                <div key={i} className="flex-1 text-center text-[9px] text-charcoal-400" style={{ minWidth: '36px' }}>{h}</div>
              ))}
            </div>
            {/* Day rows */}
            {DAY_LABELS.map((day, di) => (
              <div key={di} className="flex items-center mb-1" style={{ position: 'relative' }}>
                <div className="w-10 text-[10px] text-charcoal-500 font-semibold flex-shrink-0">{day}</div>
                {grid[di].map((count, hi) => {
                  const intensity = count === 0 ? 0.08 : Math.max(0.08, Math.min(0.95, count / maxCount))
                  const bg = `rgba(13, 148, 136, ${intensity.toFixed(2)})`
                  const isHovered = hovered?.day === di && hovered?.hour === hi
                  return (
                    <div
                      key={hi}
                      className="flex-1 rounded-sm mx-0.5 cursor-default relative"
                      style={{ height: '32px', minWidth: '36px', backgroundColor: bg }}
                      onMouseEnter={() => setHovered({ day: di, hour: hi })}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {isHovered && count > 0 && (
                        <div
                          className="absolute z-10 bg-charcoal-900 text-white text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap pointer-events-none"
                          style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '4px' }}
                        >
                          {count} {count === 1 ? 'cut' : 'cuts'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      {hasData && !loading && (
        <div className="border-t border-warm-200 px-5 py-3 space-y-1">
          <div className="text-xs text-charcoal-500">
            <span className="text-charcoal-900 font-semibold">Busiest:</span>{' '}
            {busiestDayName} {HOUR_LABELS[busiestHour]} ({busiestCount} {busiestCount === 1 ? 'cut' : 'cuts'})
          </div>
          {slowestDayName && (
            <div className="text-xs text-charcoal-500">
              <span className="text-charcoal-900 font-semibold">Slowest:</span>{' '}
              {slowestDayName} {HOUR_LABELS[slowestHour]}
            </div>
          )}
          <a
            href={`/dashboard/campaigns?intent=${encodeURIComponent(fillDayIntent)}`}
            className="inline-block text-xs font-semibold text-od-green hover:text-od-green-light transition-colors mt-1"
          >
            Fill {busiestDayName} slots →
          </a>
        </div>
      )}
    </div>
  )
}
