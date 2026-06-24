'use client'

const HOURS = Array.from({ length: 12 }, (_, i) => {
  const h = i + 8
  return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
})
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  appointments: { date: string; time?: string | null }[]
}

export default function PeakHoursHeatmap({ appointments }: Props) {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0))

  for (const a of appointments) {
    if (!a.time) continue
    const d = new Date(a.date + 'T12:00:00')
    const dayIndex = (d.getDay() + 6) % 7 // 0=Mon … 6=Sun
    const hour = parseInt(a.time.split(':')[0], 10)
    const col = hour - 8
    if (col >= 0 && col < 12) grid[dayIndex][col]++
  }

  const maxCount = Math.max(...grid.flat(), 1)
  const hasData = grid.flat().some(v => v > 0)

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-warm-200">
        <div className="font-serif text-charcoal-900">Peak Hours</div>
        <div className="text-xs text-charcoal-500 mt-0.5">When your chair is busiest — darker = more cuts</div>
      </div>
      <div className="p-4 overflow-x-auto">
        {!hasData ? (
          <div className="text-sm text-charcoal-400 text-center py-4">No time data recorded yet.</div>
        ) : (
          <div style={{ minWidth: '440px' }}>
            <div className="flex mb-1 pl-10">
              {HOURS.map((h, i) => (
                <div key={i} className="flex-1 text-center text-[9px] text-charcoal-400" style={{ minWidth: '36px' }}>{h}</div>
              ))}
            </div>
            {DAYS.map((day, di) => (
              <div key={di} className="flex items-center mb-1">
                <div className="w-10 text-[10px] text-charcoal-500 font-semibold flex-shrink-0">{day}</div>
                {grid[di].map((count, hi) => {
                  const intensity = count / maxCount
                  const bg = count === 0
                    ? 'rgb(232,224,213)'
                    : `rgba(75,83,32,${(0.12 + intensity * 0.82).toFixed(2)})`
                  return (
                    <div
                      key={hi}
                      className="flex-1 rounded-sm mx-0.5"
                      style={{ height: '36px', minWidth: '36px', backgroundColor: bg }}
                      title={`${day} ${HOURS[hi]}: ${count} cut${count !== 1 ? 's' : ''}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
