'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { isNativeApp } from '@/lib/platform'

/**
 * Gates subscription/signup pages in the native app.
 * Apple requires IAP for in-app purchases — since ChairOS subscriptions
 * are sold via Stripe on the website, these pages are login-only in the
 * native wrapper. Web users see the normal page.
 *
 * If the user is already logged in and lands here, they're past-due or
 * blocked — show them a message instead of a Sign In button that would
 * loop back to /login → /subscribe forever.
 *
 * Wrap the page content: <NativeSubscribeGate>{children}</NativeSubscribeGate>
 */
export default function NativeSubscribeGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [isNative, setIsNative] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    const native = isNativeApp()
    setIsNative(native)
    if (native) {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        setLoggedIn(!!user)
        setChecked(true)
      })
    } else {
      setChecked(true)
    }
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (!checked) {
    return (
      <div className="min-h-screen bg-[#0F0E0C] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-[#8A9A3B] animate-spin" />
      </div>
    )
  }

  if (isNative) {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-white flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8A9A3B] to-[#5A6630] flex items-center justify-center text-white font-bold text-2xl mx-auto mb-6">
            C
          </div>
          {loggedIn ? (
            <>
              <h1 className="text-xl font-bold mb-2">Subscription needs attention</h1>
              <p className="text-white/60 text-sm mb-4">
                Your subscription needs to be updated. Visit chairos.cc in your browser to manage billing.
              </p>
              <p className="text-white/40 text-xs mb-6">
                Your data is safe and secure. Once billing is sorted, sign back in here and everything will be right where you left it.
              </p>
              <button
                onClick={handleSignOut}
                className="w-full py-3 rounded-xl border border-white/20 text-white font-bold text-sm hover:bg-white/10 transition-colors">
                Sign Out
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold mb-2">Subscriptions on chairos.cc</h1>
              <p className="text-white/60 text-sm mb-4">
                To start a subscription or create a new shop, visit chairos.cc in your browser. Then sign in here.
              </p>
              <p className="text-white/40 text-xs mb-6">
                Your data is safe and secure. If you ever need to start fresh, just sign up again with the same email — your shop and client history will be right where you left them.
              </p>
              <button
                onClick={() => { window.location.href = '/login' }}
                className="w-full py-3 rounded-xl bg-[#8A9A3B] text-white font-bold text-sm hover:bg-[#7A8A33] transition-colors">
                Sign In
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return <>{children}</>
}
