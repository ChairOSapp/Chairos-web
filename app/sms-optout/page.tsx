'use client'
import { useState } from 'react'

export default function SmsOptOutPage() {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return
    setStatus('submitting')
    setErrorMessage('')

    try {
      const res = await fetch('/api/sms/optout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })

      if (res.ok) {
        setStatus('success')
      } else {
        setErrorMessage('Phone number not found.')
        setStatus('error')
      }
    } catch {
      setErrorMessage('Phone number not found.')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#141412', color: '#EDECEA' }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2 text-center">Unsubscribe from SMS</h1>
        <p className="text-sm text-center mb-8" style={{ color: '#EDECEA99' }}>
          Enter your phone number to stop receiving SMS messages from ChairOS.
        </p>

        {status === 'success' ? (
          <p className="text-sm text-center rounded-lg px-4 py-3" style={{ background: '#7A8C3A22', border: '1px solid #7A8C3A55' }}>
            You have been unsubscribed. You will no longer receive SMS messages.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#EDECEA99' }}>
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(555) 000-0000"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none"
                style={{ background: '#1F1F1C', border: '1px solid #33332E', color: '#EDECEA' }}
              />
            </div>

            {status === 'error' && (
              <p className="text-sm rounded-lg px-4 py-3" style={{ background: '#B4433322', border: '1px solid #B4433355', color: '#EDECEA' }}>
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'submitting' || !phone.trim()}
              className="w-full font-semibold py-3 rounded-lg text-sm transition-opacity disabled:opacity-50"
              style={{ background: '#7A8C3A', color: '#141412' }}
            >
              {status === 'submitting' ? 'Submitting...' : 'Unsubscribe from SMS'}
            </button>
          </form>
        )}

        <p className="text-xs text-center mt-8" style={{ color: '#EDECEA66' }}>
          You can also opt out at any time by replying STOP to any SMS message. Questions? Contact{' '}
          <a href="mailto:support@chairos.cc" className="underline">support@chairos.cc</a>.
        </p>
      </div>
    </div>
  )
}
