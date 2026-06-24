'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

export default function InvitePage() {
  const [shop, setShop] = useState<any>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: shops } = await supabase
        .from('shops').select('id, name, invite_code').eq('owner_id', user.id).limit(1)
      setShop(shops?.[0] || null)
    }
    load()
  }, [])

  async function generateLink() {
    setGenerating(true)
    setError('')
    const res = await fetch('/api/invite/generate', { method: 'POST' })
    const data = await res.json()
    if (data.token) {
      const url = `${window.location.origin}/join?token=${data.token}`
      setInviteLink(url)
    } else {
      setError(data.error || 'Failed to generate invite')
    }
    setGenerating(false)
  }

  function copy(text: string, type: 'link' | 'code') {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const shopCodeFormatted = shop?.invite_code || ''
  const shopCode9 = shop?.shop_code || ''
  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shop?.name || ''} ownerName={''} initials={initials} />
      <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-charcoal-500 hover:text-od-green text-sm transition-colors">← Back</button>
          <h1 className="font-serif text-2xl text-charcoal-900">Invite Barbers</h1>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

        {/* Shop Code */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-4">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Shop Code</div>
          <p className="text-charcoal-500 text-xs mb-4">Barbers enter this code on the Join page. Works for anyone — share freely.</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 font-mono text-lg text-charcoal-900 tracking-widest text-center">
              {shopCode9 || '—'}
            </div>
            <button
              onClick={() => shopCode9 && copy(shopCode9, 'code')}
              disabled={!shopCode9}
              className="px-4 py-3 bg-od-green/10 border border-od-green/30 text-od-green text-sm font-semibold rounded-lg hover:bg-od-green/20 transition-colors disabled:opacity-40"
            >
              {copied === 'code' ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
        </div>

        {/* Invite Link */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">Invite Link</div>
          <p className="text-charcoal-500 text-xs mb-4">Generate a one-time link. Send it directly to a barber — expires after use.</p>

          {inviteLink ? (
            <div className="space-y-3">
              <div className="bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-700 text-xs break-all font-mono">
                {inviteLink}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copy(inviteLink, 'link')}
                  className="flex-1 px-4 py-2 bg-od-green text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
                >
                  {copied === 'link' ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={generateLink}
                  disabled={generating}
                  className="px-4 py-2 bg-warm-200 border border-warm-300 text-charcoal-600 text-sm font-semibold rounded-lg hover:border-warm-400 transition-colors disabled:opacity-50"
                >
                  New Link
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={generateLink}
              disabled={generating}
              className="w-full py-3 bg-od-green text-white font-semibold text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Invite Link'}
            </button>
          )}
        </div>
      </div>
      <MobileNav />
    </div>
  )
}
