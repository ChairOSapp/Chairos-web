'use client'
import { useEffect, useState } from 'react'

// Fill Ahead card: tomorrow's (or the next day's) open prime spots,
// matched to regulars who are due for their usual service. One tap texts
// the offers through the waitlist claim machinery (see lib/fillAhead.ts
// and /api/fill-ahead). The card renders nothing when there is nothing
// to fill -- it only shows up when money is sitting in empty chairs.

interface PreviewOffer {
  barberName: string
  serviceName: string
  price: number | null
  time: string
  timeDisplay: string
  leadFirstName: string
  backupCount: number
}

interface Preview {
  date: string
  totalValue: number
  offers: PreviewOffer[]
}

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}

export default function FillAheadCard() {
  const [offsetDays, setOffsetDays] = useState(1)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState<number | null>(null)
  const [error, setError] = useState('')

  const todayStr = toDateStr(new Date())
  const targetDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return toDateStr(d)
  })()
  const targetWeekday = (() => {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return d.toLocaleDateString('en-US', { weekday: 'long' })
  })()
  const dayAfterWeekday = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 2)
    return d.toLocaleDateString('en-US', { weekday: 'short' })
  })()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/fill-ahead/preview?date=${targetDate}&today=${todayStr}`)
        if (cancelled) return
        setPreview(res.ok ? await res.json() : null)
      } catch {
        if (!cancelled) setPreview(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate])

  function pickOffset(days: number) {
    setOffsetDays(days)
    setLoading(true)
    setSentCount(null)
    setError('')
  }

  async function sendOffers() {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/fill-ahead/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: targetDate, today: todayStr }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Something went wrong sending the offers. Try again in a moment.')
        return
      }
      setSentCount(data?.offersSent ?? 0)
    } catch {
      setError('Something went wrong sending the offers. Try again in a moment.')
    } finally {
      setSending(false)
    }
  }

  if (loading || !preview || preview.offers.length === 0) return null

  const spotCount = preview.offers.length

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Fill Ahead</div>
        <div className="flex gap-2">
          <button
            onClick={() => pickOffset(1)}
            className={offsetDays === 1 ? 'btn-chairos' : 'btn-chairos-outline'}
          >
            Tomorrow
          </button>
          <button
            onClick={() => pickOffset(2)}
            className={offsetDays === 2 ? 'btn-chairos' : 'btn-chairos-outline'}
          >
            {dayAfterWeekday}
          </button>
        </div>
      </div>

      <div className="font-serif text-3xl text-charcoal-900 leading-tight mb-1">
        {targetWeekday} has {money(preview.totalValue)} sitting empty.
      </div>
      <div className="text-sm text-charcoal-500 mb-4">
        {spotCount} open {spotCount === 1 ? 'spot' : 'spots'}. Your regulars who are due get a text offer. First reply books it.
      </div>

      <div className="space-y-2 mb-4">
        {preview.offers.slice(0, 4).map((o, i) => (
          <div key={`${o.time}-${o.barberName}-${i}`} className="bg-warm-50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="text-sm text-charcoal-900">
              <span className="font-semibold">{o.timeDisplay}</span>
              {' · '}{o.serviceName} with {o.barberName}
            </div>
            <div className="text-xs text-charcoal-500 text-right flex-shrink-0">
              {o.leadFirstName} gets first shot{o.backupCount > 0 ? ` · ${o.backupCount} more in line` : ''}
            </div>
          </div>
        ))}
        {preview.offers.length > 4 && (
          <div className="text-xs text-charcoal-500 px-1">Plus {preview.offers.length - 4} more open {preview.offers.length - 4 === 1 ? 'spot' : 'spots'}.</div>
        )}
      </div>

      {sentCount !== null ? (
        <div className="text-sm text-charcoal-900 bg-warm-50 rounded-xl px-3 py-2.5">
          {sentCount > 0
            ? `Offers are out for ${sentCount} ${sentCount === 1 ? 'spot' : 'spots'}. Anything claimed shows up on the calendar like any booking.`
            : 'Those spots were already offered today, or just filled. Nothing new sent.'}
        </div>
      ) : (
        <>
          <button onClick={sendOffers} disabled={sending} className="btn-chairos disabled:opacity-50">
            {sending ? 'Sending...' : 'Text the offers'}
          </button>
          {error && <div className="text-sm text-red-500 mt-2">{error}</div>}
        </>
      )}
    </div>
  )
}
