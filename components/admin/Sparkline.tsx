'use client'

// Minimal SVG sparkline. Pass daily counts; renders a smooth-ish polyline
// with a soft fill. Zero-dependency, scales to its container.
export default function Sparkline({
  data,
  stroke = '#7A8C3A',
  height = 36,
}: {
  data: number[]
  stroke?: string
  height?: number
}) {
  const w = 120
  const h = height
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = max - min || 1
  const step = data.length > 1 ? w / (data.length - 1) : w
  const pts = data.map((v, i) => {
    const x = i * step
    const y = h - 3 - ((v - min) / span) * (h - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const line = pts.join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  const id = `sg-${stroke.replace('#', '')}-${data.length}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
