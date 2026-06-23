'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

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
    <div className="border-t border-warm-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 text-left"
      >
        <span className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">{title}</span>
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
  const [dismissed, setDismissed] = useState(false)
  const supabase = createClient()

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

      if (data && !data.read_at) {
        await supabase.from('briefs').update({ read_at: new Date().toISOString() }).eq('id', data.id)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-5 animate-pulse">
      <div className="h-3 w-32 bg-warm-300 rounded mb-3" />
      <div className="h-5 w-3/4 bg-warm-300 rounded" />
    </div>
  )

  if (!brief || dismissed) return null

  const c = brief.content ?? {}
  const isWeekly = brief.brief_type === 'weekly'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = recipientName ? `, ${recipientName.split(' ')[0]}` : ''

  return (
    <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-charcoal-500 mb-1">
            {greeting}{name}. Here's your ChairOS {isWeekly ? 'weekly' : 'daily'} brief.
          </div>
          <div className="font-serif text-lg text-od-green leading-snug">{c.headline ?? brief.summary}</div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-charcoal-400 hover:text-charcoal-600 ml-4 mt-0.5 flex-shrink-0"
          aria-label="Dismiss brief"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Sections */}
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
      {isWeekly && c.watch_list && (
        <Section title="Watch List">
          {c.watch_list.barbers?.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-semibold text-charcoal-500 uppercase tracking-wider mb-1">Barbers</div>
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
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-2">Suggestions</div>
          <ol className="space-y-2">
            {c.suggestions.map((s: string, i: number) => (
              <li key={i} className="flex gap-2.5 text-sm text-charcoal-700">
                <span className="text-od-green font-bold flex-shrink-0">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* One Thing */}
      {c.one_thing && (
        <div className="mt-4 bg-od-green/8 border border-od-green/20 rounded-lg px-4 py-3">
          <div className="text-xs font-semibold tracking-widest uppercase text-od-green mb-1">Your one thing today</div>
          <div className="text-sm font-semibold text-charcoal-900">{c.one_thing}</div>
        </div>
      )}
    </div>
  )
}
