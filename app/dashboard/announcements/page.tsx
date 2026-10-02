'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import OwnerNav from '@/components/OwnerNav'
import StaffNav from '@/components/StaffNav'
import MobileNav from '@/components/MobileNav'
import StaffMobileNav from '@/components/StaffMobileNav'
import AnnouncementsBoard from '@/components/AnnouncementsBoard'

// Shared shop board: owners see the board plus the compose box;
// staff see the board read-only. Staff reach it from their nav;
// owners from theirs. Clients never see this page.
function AnnouncementsPageInner() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).maybeSingle()
      if (!prof) { router.push('/onboarding'); return }
      // Resolve shop: owned first, else active staff membership.
      let shopRow: any = null
      const { data: owned } = await supabase.from('shops').select('id, name').eq('owner_id', user.id).maybeSingle()
      if (owned) {
        shopRow = owned
      } else {
        const { data: membership } = await supabase
          .from('shop_barbers').select('shop_id, shops(id, name)')
          .eq('barber_id', user.id).eq('active', true).maybeSingle()
        shopRow = (membership as any)?.shops ?? null
      }
      if (!shopRow) { router.push('/onboarding'); return }
      const { data: barberRows } = await supabase.from('shop_barbers').select('*').eq('shop_id', shopRow.id)
      if (!cancelled) {
        setProfile(prof)
        setShop(shopRow)
        setBarbers(barberRows || [])
        setLoading(false)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [router])

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  const isStaff = profile?.role === 'barber'

  return (
    <div className="min-h-screen bg-warm-50">
      {isStaff ? (
        <StaffNav
          shopName={shop?.name ?? ''}
          barberName={(() => { const b = barbers.find((x: any) => x.barber_id === profile?.id); return b?.barber_name || b?.alias || profile?.full_name || 'You' })()}
          color={barbers.find((x: any) => x.barber_id === profile?.id)?.color || '#b8861f'}
          initial={(profile?.full_name ?? 'S')[0].toUpperCase()}
          photoUrl={barbers.find((x: any) => x.barber_id === profile?.id)?.photo_url || undefined}
          userId={profile?.id}
        />
      ) : (
        <OwnerNav
          shopName={shop?.name ?? ''}
          ownerName={profile?.full_name ?? ''}
          initials={(profile?.full_name ?? 'O').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
          userId={profile?.id}
        />
      )}

      <div className="p-6 max-w-3xl mx-auto md:pb-0 pb-24">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Announcements</h1>
          <p className="text-charcoal-500 text-sm">
            {isStaff
              ? 'Updates from your shop — pinned posts stay on top.'
              : 'Post updates for your team — schedule changes, time off, new policies. Only you can post; your staff can read.'}
          </p>
        </div>
        <AnnouncementsBoard />
      </div>

      {isStaff ? <StaffMobileNav userId={profile?.id} /> : <MobileNav />}
    </div>
  )
}

export default function AnnouncementsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
      </div>
    }>
      <AnnouncementsPageInner />
    </Suspense>
  )
}
