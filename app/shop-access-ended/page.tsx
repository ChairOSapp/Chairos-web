'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Where staff land when the shop owner's subscription has ended and the
// grace window has closed (see the plan_type 'shop' guard in proxy.ts).
// Their access came through the shop's plan, so it ends with the plan —
// but they are one subscription away from staying on ChairOS with a shop
// of their own, and that offer is the point of this page.
export default function ShopAccessEndedPage() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-warm-300 shadow-sm p-8 text-center">
        <h1 className="text-2xl font-bold text-charcoal-900 mb-3">
          This shop&apos;s subscription has ended
        </h1>
        <p className="text-sm text-charcoal-600 mb-6">
          Your ChairOS access came through your shop&apos;s plan. The owner&apos;s
          subscription ended and the grace period has closed, so staff access
          is turned off. If the owner renews, your access comes back on its own.
        </p>

        <div className="bg-warm-100 rounded-xl p-5 mb-6">
          <h2 className="text-base font-semibold text-charcoal-900 mb-2">
            Want to stay on ChairOS?
          </h2>
          <p className="text-sm text-charcoal-600 mb-4">
            Start your own Solo Chair plan: your own booking page, your own
            clients, $25 a month. Set up takes a few minutes.
          </p>
          <button
            onClick={() => router.push('/subscribe?plan=barber')}
            className="btn-chairos w-full"
          >
            Start my own Solo Chair
          </button>
        </div>

        <button
          onClick={handleSignOut}
          className="text-xs text-charcoal-500 hover:text-charcoal-700 underline underline-offset-2"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
