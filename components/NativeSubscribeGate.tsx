'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isNativeApp } from '@/lib/platform'

/**
 * Gates subscription/signup pages in the native app.
 * Apple requires IAP for in-app purchases — since ChairOS subscriptions
 * are sold via Stripe on the website, these pages are login-only in the
 * native wrapper. Web users see the normal page.
 *
 * Wrap the page content: <NativeSubscribeGate>{children}</NativeSubscribeGate>
 */
export default function NativeSubscribeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    const native = isNativeApp()
    setIsNative(native)
    setChecked(true)
  }, [])

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
          <h1 className="text-xl font-bold mb-2">Subscriptions on chairos.cc</h1>
          <p className="text-white/60 text-sm mb-4">
            To start a subscription or create a new shop, visit chairos.cc in your browser. Then sign in here.
          </p>
          <p className="text-white/40 text-xs mb-6">
            Your data is safe and secure. If you ever need to start fresh, just sign up again with the same email — your shop and client history will be right where you left them.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-3 rounded-xl bg-[#8A9A3B] text-white font-bold text-sm hover:bg-[#7A8A33] transition-colors">
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
