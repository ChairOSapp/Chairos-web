'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

const OwnerCalendar = dynamic(
  () => import('@/components/calendar/OwnerCalendar'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#0d9488] border-t-transparent animate-spin" />
      </div>
    ),
  }
)

export default function CalendarPage() {
  const [shop, setShop] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useSearchParams()
  const openBook = params.get('book') === '1'
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: prof }, { data: shopData }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, subscription_status, trial_end').eq('id', user.id).maybeSingle(),
        supabase.from('shops').select('id, name, shop_code, invite_code, slug').eq('owner_id', user.id).maybeSingle(),
      ])
      setProfile(prof)
      if (prof?.role === 'barber') { router.push('/dashboard/barber/calendar'); return }
      if (!shopData) { router.push('/onboarding'); return }
      setShop(shopData)
      setLoading(false)
    }
    load()
  }, [supabase, router])

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-[#0d9488] border-t-transparent animate-spin" />
    </div>
  )

  const ownerName = profile?.full_name || shop?.name || ''
  const initials = ownerName.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col">
      <OwnerNav shopName={shop?.name || ''} ownerName={ownerName} initials={initials} userId={profile?.id} />
      <div className="flex-1 flex flex-col lg:ml-64 pb-16 lg:pb-0 min-h-0" style={{ height: 'calc(100dvh - 56px)' }}>
        <OwnerCalendar
          shopId={shop.id}
          shopName={shop.name}
          shopCode={shop.invite_code || shop.shop_code}
          openBookOnLoad={openBook}
        />
      </div>
      <MobileNav />
    </div>
  )
}
