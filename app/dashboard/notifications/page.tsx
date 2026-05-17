'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import MobileNav from '@/components/MobileNav'
import OwnerNav from '@/components/OwnerNav'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [shop, setShop] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUser(user)

    const { data: profileData } = await supabase
      .from('profiles').select('full_name, role').eq('id', user.id).maybeSingle()
    setProfile(profileData)

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    setShop(shops?.[0] || null)

    const { data: notifs } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setNotifications(notifs || [])

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)

    setLoading(false)
  }

  const getDotColor = (type: string) => {
    if (type === 'booking') return 'bg-amber-500'
    if (type === 'tip') return 'bg-green-500'
    if (type === 'floor') return 'bg-blue-500'
    if (type === 'client') return 'bg-red-400'
    return 'bg-neutral-500'
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
    </div>
  )

  const unread = notifications.filter(n => !n.read).length

  return (
    <div className="min-h-screen bg-neutral-950">
      <OwnerNav
        shopName={shop?.name || ''}
        ownerName={profile?.full_name || ''}
        initials={profile?.full_name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'OS'}
        userId={user?.id}
      />

      <div className="p-5 max-w-2xl mx-auto pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl text-white mb-1">Notifications</h1>
            <p className="text-neutral-500 text-sm">
              {unread > 0 ? `${unread} unread` : 'All caught up'}
            </p>
          </div>
          {notifications.length > 0 && (
            <button
              onClick={async () => {
                await supabase.from('notifications')
                  .update({ read: true })
                  .eq('user_id', user?.id)
                setNotifications(prev => prev.map(n => ({ ...n, read: true })))
              }}
              className="text-xs text-amber-500 hover:text-amber-400 transition-colors">
              Mark all read
            </button>
          )}
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-3">🔔</div>
              <div className="text-sm text-neutral-500">No notifications yet.</div>
              <div className="text-xs text-neutral-600 mt-1">You'll see booking alerts and updates here.</div>
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {notifications.map(n => (
                <div key={n.id}
                  className={`px-5 py-4 flex items-start gap-3 transition-colors ${!n.read ? 'bg-amber-500/5' : ''}`}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getDotColor(n.type)} ${n.read ? 'opacity-30' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${n.read ? 'text-neutral-400' : 'text-white'}`}>
                      {n.title}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">{n.body}</div>
                    <div className="text-xs text-neutral-600 mt-1">
                      {new Date(n.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                      })}
                    </div>
                  </div>
                  {!n.read && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-2" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <MobileNav />
    </div>
  )
}
