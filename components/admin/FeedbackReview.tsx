'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Feedback {
  id: string
  email: string | null
  message: string
  category: string | null
  created_at: string
  reviewed_at: string | null
}

export default function FeedbackReview() {
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('app_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      setItems(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function markReviewed(id: string) {
    await supabase.from('app_feedback').update({ reviewed_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(f => f.id === id ? { ...f, reviewed_at: new Date().toISOString() } : f))
  }

  if (loading) return <div className="text-sm text-charcoal-400">Loading feedback...</div>
  if (items.length === 0) return <div className="text-sm text-charcoal-400">No feedback yet.</div>

  const unreviewed = items.filter(f => !f.reviewed_at).length

  return (
    <div>
      {unreviewed > 0 && (
        <div className="text-sm font-semibold text-od-green mb-3">{unreviewed} new</div>
      )}
      <div className="space-y-3">
        {items.map(f => (
          <div key={f.id} className={`rounded-xl border p-4 ${f.reviewed_at ? 'border-warm-200 opacity-60' : 'border-od-green/30 bg-od-green/5'}`}>
            <div className="text-sm text-charcoal-900 mb-2">{f.message}</div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-charcoal-400">
                {f.email ?? 'Anonymous'} · {new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
              {!f.reviewed_at && (
                <button onClick={() => markReviewed(f.id)} className="text-xs font-semibold text-od-green hover:text-od-green-light">
                  Mark reviewed
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
