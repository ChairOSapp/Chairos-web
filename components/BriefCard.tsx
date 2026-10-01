'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useVerticalLabels } from '@/lib/VerticalContext'

type Brief = {
  id: string
  brief_type: 'daily' | 'weekly'
  content: any
  summary: string
  delivered_at: string
  read_at: string | null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-warm-200 dark:border-[#2A2A26]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 text-left"
      >
        <span className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 dark:text-[#9B9B8F]">{title}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          className="text-charcoal-400"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="pb-4 text-sm text-charcoal-700 leading-relaxed">{children}</div>}
    </div>
  )
}

export default function BriefCard({ recipientName }: { recipientName?: string }) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [showAllBarbers, setShowAllBarbers] = useState(false)
  const [briefCollapsed, setBriefCollapsed] = useState(() => {
    try { return localStorage.getItem('chairos:brief_collapsed') === '1' } catch { return false }
  })
  const supabase = createClient()
  const router = useRouter()

  function dismissBrief() {
    if (brief) {
      try { localStorage.setItem('chairos:brief_dismissed', brief.id) } catch {}
    }
    setDismissed(true)
  }
  const { staffLabelPlural } = useVerticalLabels()

  function toggleBriefCollapsed() {
    setBriefCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('chairos:brief_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const today = new Date().toISOString().split('T')[0]

      const { data } = await supabase
        .from('briefs')
        .select('*')
        .eq('recipient_id', user.id)
        .gte('delivered_at', `${today}T00:00:00`)
        .order('delivered_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setBrief(data ?? null)
      setLoading(false)

      // Restore dismissed state for this specific brief
      if (data) {
        try {
          if (localStorage.getItem('chairos:brief_dismissed') === data.id) {
            setDismissed(true)
          }
        } catch {}
      }

      if (data && !data.read_at) {
        await supabase.from('briefs').update({ read_at: new Date().toISOString() }).eq('id', data.id)
      }
    }
    load()
  }, [])

  async function generateBrief() {
    setGenerating(true)
    setGenError('')
    try {
      const res = await fetch('/api/briefs/generate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate')
      setBrief(json.brief)
    } catch (err: any) {
      setGenError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return (
    <div className="bg-warm-100 dark:bg-[#1E1E1B] border border-warm-200 dark:border-[#2A2A26] rounded-xl p-5 mb-5 animate-pulse">
      <div className="h-3 w-32 bg-warm-300 dark:bg-[#2A2A26] rounded mb-3" />
      <div className="h-5 w-3/4 bg-warm-300 dark:bg-[#2A2A26] rounded" />
    </div>
  )

  if (!brief || dismissed) {
    if (dismissed) return null
    return (
      <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-5">
        <div className="text-sm text-charcoal-700 mb-3">
          No brief generated today yet. Daily briefs run automatically at 7am ET, or you can generate one now.
        </div>
        {genError && <p className="text-xs text-red-400 mb-3">{genError}</p>}
        <button
          onClick={generateBrief}
          disabled={generating}
          className="bg-od-green text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-od-green-light transition-colors disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Generate My Brief'}
        </button>
      </div>
    )
  }

  const c = brief.content ?? {}
  const isWeekly = brief.brief_type === 'weekly'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = recipientName ? `, ${recipientName.split(' ')[0]}` : ''

  return (
    <div className="bg-warm-100 dark:bg-[#1E1E1B] border border-warm-200 dark:border-[#2A2A26] rounded-xl p-5 mb-5">
      {/* Header — X dismiss on left, collapse toggle on right */}
      <div className="flex items-start gap-3 mb-3">
        <button
          onClick={dismissBrief}
          className="text-od-green hover:text-od-green-light mt-0.5 flex-shrink-0"
          aria-label="Dismiss brief"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-charcoal-500 mb-1">
            {greeting}{name}. Here's your ChairOS {isWeekly ? 'weekly' : 'daily'} brief.
          </div>
          <div className="font-serif text-lg text-od-green leading-snug">{c.headline ?? brief.summary}</div>
        </div>
        <button
          onClick={toggleBriefCollapsed}
          className="text-xs font-semibold text-od-green hover:text-od-green-light flex-shrink-0 mt-1 transition-colors"
        >
          {briefCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!briefCollapsed && (
      <>

      {/* Barber Rankings — owner briefs, always visible. Top 3 by default, tap to expand. Rows link to staff detail. */}
      {c.barber_rankings?.length > 0 && (
        <div className="mb-1">
          {(showAllBarbers ? c.barber_rankings : c.barber_rankings.slice(0, 3)).map((b: any, i: number) => (
            <button
              key={b.barber_id ?? i}
              onClick={() => b.barber_id && router.push(`/dashboard/staff/${b.barber_id}`)}
              className="w-full flex items-center justify-between py-2 border-b border-warm-200 last:border-0 text-left hover:bg-warm-200/50 rounded px-1 -mx-1 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-charcoal-400 w-4 flex-shrink-0">{i + 1}</span>
                <span className="text-sm font-medium text-charcoal-900 truncate">{b.name}</span>
                {b.flag && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    b.flag === 'needs_attention'
                      ? 'bg-red-950 text-red-400 border border-red-900'
                      : 'bg-warm-200 text-charcoal-500'
                  }`}>
                    {b.flag === 'needs_attention' ? 'Needs attention' : 'No activity'}
                  </span>
                )}
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <div className="text-sm font-semibold text-charcoal-900">${b.revenue}</div>
                {b.tips > 0 && <div className="text-xs text-charcoal-400">+${b.tips} tips</div>}
              </div>
            </button>
          ))}
          {c.barber_rankings.length > 3 && (
            <button
              onClick={() => setShowAllBarbers(s => !s)}
              className="w-full text-center text-xs font-semibold text-od-green hover:text-od-green-light py-2 transition-colors"
            >
              {showAllBarbers ? 'Show less ↑' : `Show all ${c.barber_rankings.length} →`}
            </button>
          )}
        </div>
      )}

      {/* Shop Totals — collapsed */}
      {c.shop_totals && (
        <Section title="Shop Totals">
          <dl className="space-y-1.5">
            {Object.entries(c.shop_totals as Record<string, any>).map(([k, v]) => (
              v != null && (
                <div key={k} className="flex justify-between text-sm">
                  <dt className="text-charcoal-500">{k.replace(/_/g, ' ')}</dt>
                  <dd className="font-medium text-charcoal-900">
                    {typeof v === 'number' && k.includes('revenue') ? `$${v}` :
                     typeof v === 'number' && k.includes('pct') ? `${v}%` :
                     typeof v === 'number' && k.includes('ticket') ? `$${v}` :
                     String(v)}
                  </dd>
                </div>
              )
            ))}
          </dl>
        </Section>
      )}

      {/* Yesterday / Week / Month summaries */}
      {c.yesterday_summary && (
        <Section title="Yesterday">
          <p>{c.yesterday_summary}</p>
        </Section>
      )}
      {(c.week_summary || c.week_recap) && (
        <Section title="This Week">
          <p>{c.week_summary ?? c.week_recap}</p>
        </Section>
      )}
      {c.month_summary && (
        <Section title="This Month">
          <p>{c.month_summary}</p>
        </Section>
      )}

      {/* Retention Pulse — weekly owner brief */}
      {isWeekly && c.retention_pulse && (
        <Section title="Retention Pulse">
          {c.retention_pulse.best_week && (
            <p className="mb-1"><span className="font-medium text-od-green">Best week:</span> {c.retention_pulse.best_week}</p>
          )}
          {c.retention_pulse.worst_week && (
            <p className="mb-1"><span className="font-medium text-red-400">Needs support:</span> {c.retention_pulse.worst_week}</p>
          )}
          {c.retention_pulse.owner_action && (
            <p className="mt-2 text-charcoal-900 font-medium">{c.retention_pulse.owner_action}</p>
          )}
        </Section>
      )}

      {/* Watch List */}
      {isWeekly && c.watch_list && (
        <Section title="Watch List">
          {c.watch_list.barbers?.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider mb-1">{staffLabelPlural}</div>
              <ul className="space-y-0.5">
                {c.watch_list.barbers.map((b: string, i: number) => (
                  <li key={i} className="text-charcoal-700">• {b}</li>
                ))}
              </ul>
            </div>
          )}
          {c.watch_list.clients?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider mb-1">Clients to Reach</div>
              <ul className="space-y-0.5">
                {c.watch_list.clients.map((cl: string, i: number) => (
                  <li key={i} className="text-charcoal-700">• {cl}</li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {/* Client Alerts — barber brief */}
      {c.client_alerts?.length > 0 && (
        <Section title="Client Alerts">
          <ul className="space-y-1">
            {c.client_alerts.slice(0, 5).map((a: any, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.days_since >= 60 ? 'bg-red-400' : 'bg-amber-400'}`} />
                <span>{a.name} — {a.days_since} days</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Suggestions */}
      {c.suggestions?.length > 0 && (
        <div className="border-t border-warm-200 pt-3 mt-0">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-2">
            {c.barber_rankings?.length > 0 ? 'Your Team This Week' : 'Suggestions'}
          </div>
          <ol className="space-y-2">
            {c.suggestions.map((s: any, i: number) => (
              <li key={i} className="flex gap-2.5 text-sm text-charcoal-700">
                <span className="text-od-green font-bold flex-shrink-0">{i + 1}.</span>
                <span>{typeof s === 'string' ? s : s.action ?? s.text ?? JSON.stringify(s)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* One Thing */}
      {c.one_thing && (
        <div className="mt-4 rounded-lg px-4 py-3" style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)' }}>
          <div className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--color-primary)' }}>Your one thing today</div>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{c.one_thing}</div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
