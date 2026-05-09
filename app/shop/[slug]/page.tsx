'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'

export default function ShopProfile() {
  const params = useParams()
  const slug = params.slug as string
  const supabase = createClient()
  const router = useRouter()

  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<'services'|'team'>('services')

  useEffect(() => {
    async function load() {
      const { data: shop } = await supabase
        .from('shops')
        .select('*')
        .eq('slug', slug)
        .single()

      if (!shop) { setNotFound(true); setLoading(false); return }
      setShop(shop)

      const { data: barbers } = await supabase
        .from('shop_barbers')
        .select('*')
        .eq('shop_id', shop.id)
        .eq('active', true)
      setBarbers(barbers || [])

      const { data: services } = await supabase
        .from('services')
        .select('*')
        .eq('shop_id', shop.id)
        .eq('active', true)
        .order('price', { ascending: true })
      setServices(services || [])

      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="font-serif text-3xl text-amber-500 mb-4">ChairOS</h1>
        <p className="text-neutral-400 mb-6">Shop not found.</p>
        <a href="/" className="text-sm text-neutral-500 hover:text-white transition-colors">← Go home</a>
      </div>
    </div>
  )

  const brand = shop.brand_color || '#b8861f'
  const brandLight = brand + '18'
  const brandMid = brand + '33'
  const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']
  const bookingUrl = `/book/${shop.shop_code}`

  return (
    <div className="min-h-screen bg-neutral-950">

      {/* HERO */}
      <div className="relative">
        {shop.hero_url ? (
          <div className="w-full h-64 md:h-80 overflow-hidden">
            <img src={shop.hero_url} alt={shop.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-neutral-950" />
          </div>
        ) : (
          <div className="w-full h-40" style={{ background: `linear-gradient(135deg, ${brand}22, ${brand}08)` }} />
        )}

        {/* SHOP IDENTITY */}
        <div className={`max-w-3xl mx-auto px-6 ${shop.hero_url ? '-mt-20 relative z-10' : 'pt-8'}`}>
          <div className="flex items-end gap-5 mb-6">
            {shop.logo_url ? (
              <img src={shop.logo_url} alt={shop.name}
                className="w-20 h-20 rounded-2xl object-cover flex-shrink-0 shadow-xl border-4 border-neutral-950" />
            ) : (
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center font-serif text-3xl font-bold flex-shrink-0 shadow-xl border-4 border-neutral-950"
                style={{ background: brandMid, color: brand }}>
                {shop.name[0]}
              </div>
            )}
            <div className="pb-1">
              <h1 className="font-serif text-2xl md:text-3xl text-white">{shop.name}</h1>
              {shop.tagline && <p className="text-sm mt-1" style={{ color: brand }}>{shop.tagline}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* STICKY BOOK BUTTON */}
      <div className="sticky top-0 z-50 bg-neutral-950/95 backdrop-blur border-b border-neutral-800 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {shop.logo_url && (
              <img src={shop.logo_url} alt={shop.name} className="w-7 h-7 rounded-lg object-cover" />
            )}
            <span className="font-serif text-white text-sm">{shop.name}</span>
          </div>
          <button
            onClick={() => router.push(bookingUrl)}
            className="font-semibold px-5 py-2 rounded-lg text-sm text-black transition-opacity hover:opacity-90"
            style={{ background: brand }}>
            Book Now
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* ABOUT */}
        {(shop.bio || shop.address || shop.phone) && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
            {shop.bio && (
              <p className="text-neutral-300 text-sm leading-relaxed mb-4">{shop.bio}</p>
            )}
            <div className="flex flex-wrap gap-4">
              {shop.address && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  {shop.address}{shop.city ? `, ${shop.city}` : ''}
                </div>
              )}
              {shop.phone && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.85a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  {shop.phone}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TABS */}
        <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 mb-6 w-fit">
          {(['services','team'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
              style={{
                background: activeTab === tab ? brand : 'transparent',
                color: activeTab === tab ? '#000' : '#6b7280'
              }}>
              {tab === 'services' ? `Services (${services.length})` : `The Team (${barbers.length})`}
            </button>
          ))}
        </div>

        {/* SERVICES TAB */}
        {activeTab === 'services' && (
          <div className="space-y-2">
            {services.length === 0 ? (
              <div className="text-center text-neutral-500 text-sm py-8">No services listed yet.</div>
            ) : (
              services.map(s => (
                <div key={s.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex items-center justify-between hover:border-neutral-700 transition-colors cursor-pointer"
                  onClick={() => router.push(bookingUrl)}>
                  <div>
                    <div className="text-sm font-semibold text-white">{s.name}</div>
                    {s.description && <div className="text-xs text-neutral-500 mt-0.5">{s.description}</div>}
                    <div className="text-xs text-neutral-600 mt-1">{s.duration_minutes} mins</div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <span className="font-serif text-xl font-semibold" style={{ color: brand }}>${s.price}</span>
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black"
                      style={{ background: brand }}>
                      Book
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {barbers.length === 0 ? (
              <div className="col-span-3 text-center text-neutral-500 text-sm py-8">No team members listed yet.</div>
            ) : (
              barbers.map((b, i) => (
                <div key={b.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 text-center hover:border-neutral-700 transition-colors cursor-pointer"
                  onClick={() => router.push(bookingUrl)}>
                  {b.photo_url ? (
                    <img src={b.photo_url} alt={b.barber_name || b.alias}
                      className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border-2"
                      style={{ borderColor: b.color || COLORS[i % COLORS.length] }} />
                  ) : (
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 font-serif text-2xl font-bold"
                      style={{
                        background: (b.color || COLORS[i % COLORS.length]) + '22',
                        border: `2px solid ${b.color || COLORS[i % COLORS.length]}`,
                        color: b.color || COLORS[i % COLORS.length]
                      }}>
                      {(b.barber_name || b.alias || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="text-sm font-semibold text-white">{b.barber_name || b.alias}</div>
                  {b.alias && b.barber_name && b.alias !== b.barber_name && (
                    <div className="text-xs mt-0.5" style={{ color: brand }}>{b.alias}</div>
                  )}
                  {b.bio && <div className="text-xs text-neutral-500 mt-2 line-clamp-3">{b.bio}</div>}
                  <button
                    className="mt-3 w-full py-1.5 rounded-lg text-xs font-semibold text-black transition-opacity hover:opacity-90"
                    style={{ background: brand }}>
                    Book {b.barber_name?.split(' ')[0] || b.alias}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* BOOK CTA */}
        <div className="mt-10 rounded-xl p-8 text-center" style={{ background: brandLight, border: `1px solid ${brand}30` }}>
          <h2 className="font-serif text-xl text-white mb-2">Ready to book?</h2>
          <p className="text-neutral-400 text-sm mb-5">Choose your barber, pick a time, and you're set.</p>
          <button
            onClick={() => router.push(bookingUrl)}
            className="font-semibold px-8 py-3 rounded-lg text-sm text-black transition-opacity hover:opacity-90"
            style={{ background: brand }}>
            Book an Appointment
          </button>
        </div>

        <p className="text-neutral-700 text-xs text-center mt-8">Powered by ChairOS</p>
      </div>
    </div>
  )
}