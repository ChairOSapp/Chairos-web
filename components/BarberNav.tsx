'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function BarberNav({ shopName, barberName, color, initial, photoUrl }: {
  shopName: string
  barberName: string
  color: string
  initial: string
  photoUrl?: string
}) {
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
        {[
          { label: 'My Schedule', href: '/dashboard/barber' },
          { label: 'My Profile', href: '/dashboard/barber/settings' },
        ].map(item => {
          const active = pathname === item.href
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              className={`hidden md:flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active ? 'bg-amber-500/15 text-amber-500' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'
              }`}>
              {item.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-right">
          <div className="text-xs font-medium text-white">{barberName}</div>
          <div className="text-xs text-neutral-500">{shopName}</div>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
          style={{ background: color + '22', border: `2px solid ${color}`, color }}>
          {photoUrl
            ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            : initial}
        </div>
        <button onClick={handleSignOut} className="text-xs text-neutral-500 hover:text-white transition-colors">
          Sign out
        </button>
      </div>
    </header>
  )
}
