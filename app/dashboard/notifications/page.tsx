'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import MobileNav from '@/components/MobileNav'
import OwnerNav from '@/components/OwnerNav'
import NotificationsInbox from '@/components/NotificationsInbox'

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [shop, setShop] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

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
    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav
        shopName={shop?.name || ''}
        ownerName={profile?.full_name || ''}
        initials={profile?.full_name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'OS'}
        userId={user?.id}
      />
      <div className="p-5 pb-24">
        <NotificationsInbox />
      </div>
      <MobileNav />
    </div>
  )
}
