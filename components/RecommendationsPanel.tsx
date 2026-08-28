'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Recommendation = {
  id: string
  type: 'underbooked_service' | 'staffing_imbalance' | 'pricing_signal'
  title: string
  detail: string
  evidence: any
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  underbooked_service: 'Underbooked Service',
  staffing_imbalance: 'Staffing',
  pricing_signal: 'Pricing',
}

export default function RecommendationsPanel({ shopId }: { shopId: string }) {
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [shopId])

  async function load() {
    const { data } = await supabase
      .from('recommendations')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setRecs(data ?? [])
    setLoading(false)
  }

  async function checkNow() {
    setChecking(true)
    setError('')
    try {
      const res = await fetch('/api/recommendations/generate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to check')
      setRecs((json.recommendations ?? []).filter((r: Recommendation & { status: string }) => (r as any).status === 'active'))
    } catch (e: any) {
      setError(e.message)
    }
    setChecking(false)
  }

  async function dismiss(id: string) {
    setRecs(prev => prev.filter(r => r.id !== id))
    await fetch(`/api/recommendations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    })
  }

  if (loading || dismissed) return null

  if (recs.length === 0) {
    return (
      <div className="bg-warm-100 dark:bg-[#1E1E1B] border border-warm-200 dark:border-[#2A2A26] rounded-xl p-5 mb-5">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-1">Recommendations</div>
        <div className="text-sm text-charcoal-700 mb-3">
          No recommendations right now. These run automatically every Monday, or check now against today's data.
        </div>
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <button
          onClick={checkNow}
          disabled={checking}
          className="bg-od-green text-black font-semibold px-4 py-2 rounded-lg text-sm hover:bg-od-green-light transition-colors disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Check Now'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-warm-100 dark:bg-[#1E1E1B] border border-warm-200 dark:border-[#2A2A26] rounded-xl p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500">Recommendations</div>
        <button onClick={checkNow} disabled={checking} className="text-xs font-semibold text-od-green hover:text-od-green-light transition-colors disabled:opacity-50">
          {checking ? 'Checking…' : '↻ Refresh'}
        </button>
      </div>
      <div className="space-y-3">
        {recs.map(r => (
          <div key={r.id} className="border border-warm-200 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-od-green/10 text-od-green border border-od-green/20">
                  {TYPE_LABEL[r.type] ?? r.type}
                </span>
                <span className="text-sm font-semibold text-charcoal-900">{r.title}</span>
              </div>
              <button
                onClick={() => dismiss(r.id)}
                className="text-charcoal-400 hover:text-charcoal-600 flex-shrink-0"
                aria-label="Dismiss recommendation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-charcoal-700 leading-relaxed">{r.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
