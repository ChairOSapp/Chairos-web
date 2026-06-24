'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface BriefContent {
  headline?: string
  one_thing?: string
  suggestions?: string[]
  yesterday_summary?: string
  week_summary?: string
  shop_totals?: Record<string, any>
  [key: string]: any
}

interface Brief {
  id: string
  content: BriefContent | null
  delivered_at: string
  read_at: string | null
}

interface Props {
  userId: string
}

export default function AIInsightStrip({ userId }: Props) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const now = new Date()
        const todayMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
        const { data } = await supabase
          .from('briefs')
          .select('*')
          .eq('recipient_id', userId)
          .gte('delivered_at', todayMidnightUTC)
          .order('delivered_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setBrief(data ?? null)
      } catch {
        // never throw
      }
    }
    load()
  }, [userId])

  async function dismiss() {
    if (!brief) return
    try {
      await supabase
        .from('briefs')
        .update({ read_at: new Date().toISOString() })
        .eq('id', brief.id)
    } catch {
      // swallow
    }
    setDismissed(true)
  }

  if (dismissed) return null

  if (!brief) {
    return (
      <div className="bg-warm-100 border border-warm-200 rounded-xl p-4 mb-6 text-sm text-charcoal-500">
        Your daily brief will be ready at 7am ET. Powered by ChairOS AI
      </div>
    )
  }

  const c = brief.content ?? {}
  const headline = c.headline
  const oneThing = c.one_thing

  return (
    <div className="bg-charcoal-900 border-l-4 border-od-green rounded-xl p-4 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {headline && (
            <div className="font-serif text-lg text-white leading-snug mb-1">{headline}</div>
          )}
          {oneThing && (
            <div className="text-sm text-charcoal-400">
              Today&apos;s focus: {oneThing}
            </div>
          )}
        </div>
        <button
          onClick={dismiss}
          className="text-charcoal-400 hover:text-charcoal-200 flex-shrink-0 p-0.5 transition-colors"
          aria-label="Dismiss brief"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <button
        onClick={() => setExpanded(e => !e)}
        className="mt-2 text-xs font-semibold text-od-green hover:text-od-green-light transition-colors"
      >
        {expanded ? 'View Full Brief ↑' : 'View Full Brief →'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-charcoal-700 pt-3">
          {c.yesterday_summary && (
            <div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Yesterday</div>
              <p className="text-sm text-charcoal-300 leading-relaxed">{c.yesterday_summary}</p>
            </div>
          )}
          {c.week_summary && (
            <div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">This Week</div>
              <p className="text-sm text-charcoal-300 leading-relaxed">{c.week_summary}</p>
            </div>
          )}
          {c.suggestions && c.suggestions.length > 0 && (
            <div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Suggestions</div>
              <ol className="space-y-1.5">
                {c.suggestions.map((s: any, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-charcoal-300">
                    <span className="text-od-green font-bold flex-shrink-0">{i + 1}.</span>
                    <span>{typeof s === 'string' ? s : s.action ?? s.text ?? JSON.stringify(s)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {c.shop_totals && (
            <div>
              <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Shop Totals</div>
              <dl className="space-y-1">
                {Object.entries(c.shop_totals as Record<string, any>).map(([k, v]) =>
                  v != null ? (
                    <div key={k} className="flex justify-between text-sm">
                      <dt className="text-charcoal-400">{k.replace(/_/g, ' ')}</dt>
                      <dd className="font-medium text-charcoal-200">{String(v)}</dd>
                    </div>
                  ) : null
                )}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
