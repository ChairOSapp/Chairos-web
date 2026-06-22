'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import BarberMobileNav from '@/components/BarberMobileNav'
import BarberNav from '@/components/BarberNav'

export default function BarberNotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUser(user)

    const { data: sb } = await supabase
      .from('shop_barbers').select('*, shops(*)')
      .eq('barber_id', user.id).eq('active', true).maybeSingle()
    if (!sb) { router.push('/join'); return }
    setShopBarber(sb)

    const { data: notifs } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setNotifications(notifs || [])

    await supabase.from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)

    setLoading(false)
  }

  const getDotColor = (type: string) => {
    if (type === 'booking') return 'bg-od-green'
    if (type === 'tip') return 'bg-green-500'
    return 'bg-warm-500'
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  const color = shopBarber?.color || '#b8861f'
  const initial = (shopBarber?.barber_name || shopBarber?.alias || 'B')[0].toUpperCase()

  return (
    <div className="min-h-screen bg-warm-50">
      <BarberNav
        shopName={shopBarber?.shops?.name || ''}
        barberName={shopBarber?.barber_name || shopBarber?.alias || ''}
        color={color}
        initial={initial}
        photoUrl={shopBarber?.photo_url || undefined}
        userId={user?.id}
      />

      <div className="p-5 max-w-2xl mx-auto pb-24">
        <div className="mb-6">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Notifications</h1>
          <p className="text-charcoal-500 text-sm">Your booking alerts and updates</p>
        </div>

        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-3">🔔</div>
              <div className="text-sm text-charcoal-500">No notifications yet.</div>
              <div className="text-xs text-charcoal-600 mt-1">New bookings will appear here.</div>
            </div>
          ) : (
            <div className="divide-y divide-warm-200">
              {notifications.map(n => (
                <div key={n.id}
                  className={`px-5 py-4 flex items-start gap-3 ${!n.read ? 'bg-od-green/5' : ''}`}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getDotColor(n.type)} ${n.read ? 'opacity-30' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${n.read ? 'text-charcoal-400' : 'text-charcoal-900'}`}>
                      {n.title}
                    </div>
                    <div className="text-xs text-charcoal-500 mt-0.5">{n.body}</div>
                    <div className="text-xs text-charcoal-600 mt-1">
                      {new Date(n.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                      })}
                    </div>
                  </div>
                  {!n.read && (
                    <div className="w-1.5 h-1.5 rounded-full bg-od-green flex-shrink-0 mt-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <BarberMobileNav />
    </div>
  )
}
