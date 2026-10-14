'use client'

import { useState } from 'react'

// Small flag affordance on public review cards. One tap files the
// report (see /api/reviews/report); the button then confirms in place.
export default function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')

  async function report() {
    if (state !== 'idle') return
    setState('sending')
    try {
      const res = await fetch('/api/reviews/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId }),
      })
      setState(res.ok ? 'done' : 'idle')
    } catch {
      setState('idle')
    }
  }

  if (state === 'done') {
    return <span className="text-[11px] text-charcoal-400">Reported. Thanks for flagging it.</span>
  }

  return (
    <button
      onClick={report}
      disabled={state === 'sending'}
      className="text-[11px] text-charcoal-400 hover:text-charcoal-600 underline underline-offset-2 disabled:opacity-50"
    >
      {state === 'sending' ? 'Reporting…' : 'Report'}
    </button>
  )
}
