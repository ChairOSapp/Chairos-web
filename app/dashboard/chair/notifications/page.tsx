'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import StaffMobileNav from '@/components/StaffMobileNav'
import StaffNav from '@/components/StaffNav'
import NotificationsInbox from '@/components/NotificationsInbox'

export default function BarberNotificationsPage() {
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
    setLoading(false)
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
      <StaffNav
        shopName={shopBarber?.shops?.name || ''}
        barberName={shopBarber?.barber_name || shopBarber?.alias || ''}
        color={color}
        initial={initial}
        photoUrl={shopBarber?.photo_url || undefined}
        userId={user?.id}
      />
      <div className="p-5 pb-24">
        <NotificationsInbox />
      </div>
      <StaffMobileNav userId={user?.id} />
    </div>
  )
}
