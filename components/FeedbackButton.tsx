'use client'
import { useState } from 'react'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!message.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), category: 'app_improvement' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to send')
      setSent(true)
      setMessage('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  function close() {
    setOpen(false)
    setSent(false)
    setError('')
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex flex-col items-center gap-1.5 py-2 text-charcoal-500 dark:text-[#A8A89E] hover:text-charcoal-900 dark:hover:text-[#EDECEA] transition-colors"
      >
        <div className="w-11 h-11 rounded-xl bg-warm-200 dark:bg-[#252521] flex items-center justify-center shadow-[0_2px_8px_rgba(75,83,32,0.12)] border border-od-green/10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-od-green/80">
            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <span className="text-[11px] text-center leading-tight">Feedback</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative bg-white dark:bg-[#1E1E1B] rounded-2xl p-5 w-full max-w-md shadow-2xl">
            {sent ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-od-green/15 flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-od-green">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div className="font-semibold text-charcoal-900 dark:text-white mb-1">Thanks!</div>
                <div className="text-sm text-charcoal-500 dark:text-[#A8A89E] mb-4">Your feedback helps make ChairOS better.</div>
                <button onClick={close} className="px-6 py-2 bg-od-green text-white rounded-xl text-sm font-semibold hover:bg-od-green-light transition-colors">
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="font-semibold text-charcoal-900 dark:text-white mb-1">App Feedback</div>
                <div className="text-sm text-charcoal-500 dark:text-[#A8A89E] mb-4">Tell us what would make the app better for you.</div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  maxLength={2000}
                  className="w-full bg-warm-100 dark:bg-[#252521] border border-warm-200 dark:border-[#2A2A26] rounded-xl px-4 py-3 text-sm text-charcoal-900 dark:text-white outline-none focus:border-od-green transition-colors resize-none"
                />
                {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
                <div className="flex gap-3 mt-4">
                  <button onClick={close} className="flex-1 py-2.5 rounded-xl border border-warm-200 dark:border-[#2A2A26] text-sm font-semibold text-charcoal-600 dark:text-[#A8A89E] hover:bg-warm-100 dark:hover:bg-[#252521] transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={sending || !message.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-od-green text-white text-sm font-semibold hover:bg-od-green-light transition-colors disabled:opacity-50"
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
