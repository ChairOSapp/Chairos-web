'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import BarberNav from '@/components/BarberNav'
import BarberMobileNav from '@/components/BarberMobileNav'

const BarberCalendar = dynamic(
  () => import('@/components/calendar/BarberCalendar'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#0d9488] border-t-transparent animate-spin" />
      </div>
    ),
  }
)

export default function BarberCalendarPage() {
  const [profile, setProfile] = useState<any>(null)
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useSearchParams()
  const openBook = params.get('book') === '1'
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: prof }, { data: sb }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').eq('id', user.id).maybeSingle(),
        supabase.from('shop_barbers').select('*, shops(id, name, shop_code, invite_code)').eq('barber_id', user.id).eq('active', true).maybeSingle(),
      ])
      setProfile(prof)
      if (!sb) { router.push('/join'); return }
      setShopBarber({ ...sb, userId: user.id })
      setLoading(false)
    }
    load()
  }, [supabase, router])

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-[#0d9488] border-t-transparent animate-spin" />
    </div>
  )

  const barberName = shopBarber?.barber_name || shopBarber?.alias || profile?.full_name || 'Barber'
  const color = shopBarber?.color || '#0d9488'
  const initial = barberName[0].toUpperCase()
  const shop = shopBarber?.shops

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col">
      <BarberNav
        shopName={shop?.name || ''}
        barberName={barberName}
        color={color}
        initial={initial}
        photoUrl={shopBarber?.photo_url || undefined}
        userId={shopBarber?.userId}
      />
      <div className="flex-1 flex flex-col pb-16 lg:pb-0 min-h-0" style={{ height: 'calc(100dvh - 56px)' }}>
        <BarberCalendar
          shopId={shopBarber.shop_id}
          barberId={shopBarber.userId}
          barberName={barberName}
          shopCode={shop?.invite_code || shop?.shop_code}
          openBookOnLoad={openBook}
        />
      </div>
      <BarberMobileNav />
    </div>
  )
}
