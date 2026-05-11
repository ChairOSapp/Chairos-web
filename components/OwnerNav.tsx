'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Appointments', href: '/dashboard/appointments/new', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Barbers', href: '/dashboard/barbers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Services', href: '/dashboard/services', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Settings', href: '/dashboard/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

export default function OwnerNav({ shopName, ownerName, initials }: { shopName: string, ownerName: string, initials: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="bg-neutral-900 border-b border-neutral-800 px-4 h-14 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-1">
        <span className="font-serif text-amber-500 text-lg mr-4">ChairOS</span>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active ? 'bg-amber-500/15 text-amber-500' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'
              }`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-right">
          <div className="text-xs font-medium text-white">{ownerName}</div>
          <div className="text-xs text-neutral-500">{shopName}</div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-serif text-amber-500 text-sm">
          {initials}
        </div>
        <button onClick={handleSignOut} className="text-xs text-neutral-500 hover:text-white transition-colors">
          Sign out
        </button>
      </div>
    </header>
  )
}
