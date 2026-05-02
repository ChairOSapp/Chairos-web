'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [checking, setChecking] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.push('/dashboard')
      } else {
        setChecking(false)
      }
    }
    check()
  }, [])

  if (checking) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">

      {/* NAV */}
      <nav className="px-6 h-16 flex items-center justify-between border-b border-neutral-900">
        <span className="font-serif text-xl text-amber-500">ChairOS</span>
        <div className="flex items-center gap-4">
          <a href="/login" className="text-sm text-neutral-400 hover:text-white transition-colors">Sign in</a>
          <a href="/signup" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
            Get Started
          </a>
        </div>
      </nav>

      {/* HERO */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 mb-8">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
          <span className="text-xs font-semibold tracking-widest uppercase text-amber-500">Now in Beta</span>
        </div>

        <h1 className="font-serif text-5xl md:text-6xl text-white mb-6 max-w-2xl leading-tight">
          The OS for <span className="text-amber-500">Barbershop</span> Owners
        </h1>

        <p className="text-neutral-400 text-lg mb-10 max-w-xl leading-relaxed">
          Manage bookings, retain your barbers, and track every dollar — all in one place. Built by someone who's been behind the chair.
        </p>

        <div className="flex gap-4 flex-wrap justify-center">
          <a href="/signup" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-8 py-3.5 rounded-lg text-sm transition-colors">
            Start Free →
          </a>
          <a href="/login" className="bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-white font-semibold px-8 py-3.5 rounded-lg text-sm transition-colors">
            Sign In
          </a>
        </div>
      </div>

      {/* FEATURES */}
      <div className="px-6 pb-20 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: '✂',
              title: 'Built for Barbers',
              desc: 'Not a generic booking tool. ChairOS is designed specifically around how barbershops actually operate.'
            },
            {
              icon: '💰',
              title: 'Tip Transparency',
              desc: 'Real-time tip tracking and cashout between owner and barber. No more end of day confusion.'
            },
            {
              icon: '📊',
              title: 'Retain Your Team',
              desc: 'Commission tracking, booth rent billing, and earnings statements keep your barbers informed and loyal.'
            }
          ].map((f, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <div className="text-2xl mb-4">{f.icon}</div>
              <div className="font-serif text-lg text-white mb-2">{f.title}</div>
              <div className="text-sm text-neutral-400 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div className="border-t border-neutral-900 px-6 py-6 flex items-center justify-between">
        <span className="font-serif text-amber-500">ChairOS</span>
        <span className="text-xs text-neutral-600">© {new Date().getFullYear()} ChairOS. All rights reserved.</span>
      </div>

    </div>
  )
}