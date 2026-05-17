'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DEFAULT_HOURS = DAYS.map(day => ({
  day,
  open: day !== 'Sunday',
  from: '09:00',
  to: day === 'Saturday' || day === 'Sunday' ? '16:00' : '18:00',
}))

export default function ShopSettings() {
  const [shop, setShop] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingHero, setUploadingHero] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [bio, setBio] = useState('')
  const [brandColor, setBrandColor] = useState('#b8861f')
  const [slug, setSlug] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [heroUrl, setHeroUrl] = useState('')
  const [hours, setHours] = useState<typeof DEFAULT_HOURS>(DEFAULT_HOURS)

  const logoRef = useRef<HTMLInputElement>(null)
  const heroRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shop = shops?.[0] || null
    if (!shop) { router.push('/onboarding'); return }

    setShop(shop)
    setName(shop.name || '')
    setTagline(shop.tagline || '')
    setBio(shop.bio || '')
    setBrandColor(shop.brand_color || '#b8861f')
    setSlug(shop.slug || '')
    setPhone(shop.phone || '')
    setAddress(shop.address || '')
    setCity(shop.city || '')
    setLogoUrl(shop.logo_url || '')
    setHeroUrl(shop.hero_url || '')
    if (shop.hours) setHours(shop.hours)
    setLoading(false)
  }

  async function uploadFile(file: File, bucket: string, path: string, maxBytes: number): Promise<string | null> {
    if (file.size > maxBytes) {
      setError(`File too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)}MB`)
      return null
    }
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true })
    if (error) { setError(error.message); return null }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    setError('')
    const url = await uploadFile(file, 'shop-assets', `${shop.id}/logo`, 2 * 1024 * 1024)
    if (url) {
      setLogoUrl(url)
      await supabase.from('shops').update({ logo_url: url }).eq('id', shop.id)
    }
    setUploadingLogo(false)
  }

  async function handleHeroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingHero(true)
    setError('')
    const url = await uploadFile(file, 'shop-assets', `${shop.id}/hero`, 5 * 1024 * 1024)
    if (url) {
      setHeroUrl(url)
      await supabase.from('shops').update({ hero_url: url }).eq('id', shop.id)
    }
    setUploadingHero(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess('')

    // Validate slug — lowercase, no spaces, alphanumeric and hyphens only
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      setError('Slug can only contain lowercase letters, numbers, and hyphens')
      setSaving(false)
      return
    }

    // Check slug uniqueness if changed
    if (slug && slug !== shop.slug) {
      const { data: existing } = await supabase
        .from('shops').select('id').eq('slug', slug).single()
      if (existing && existing.id !== shop.id) {
        setError('That URL is already taken. Try a different one.')
        setSaving(false)
        return
      }
    }

    const { error: saveErr } = await supabase.from('shops').update({
      name,
      tagline,
      bio,
      brand_color: brandColor,
      slug: slug || null,
      phone,
      address,
      city,
      logo_url: logoUrl,
      hero_url: heroUrl,
      hours,
    }).eq('id', shop.id)

    if (saveErr) { setError(saveErr.message); setSaving(false); return }
    setSuccess('Settings saved.')
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-neutral-950">
      <OwnerNav shopName={shop?.name} ownerName={''} initials={initials} />

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-0">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-white mb-1">Shop Settings</h1>
          <p className="text-neutral-500 text-sm">Customize how your shop appears to clients</p>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        {/* BRANDING */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-5">Branding</div>

          {/* LOGO */}
          <div className="mb-6">
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-3">Shop Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-serif text-2xl text-neutral-600">{name[0] || '?'}</span>
                )}
              </div>
              <div>
                <button
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadingLogo}
                  className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-xs font-semibold text-neutral-400 hover:border-amber-500 hover:text-amber-500 transition-colors disabled:opacity-50">
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                </button>
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <p className="text-xs text-neutral-600 mt-2">PNG or JPG. Square works best. Max 2MB.</p>
                {logoUrl && (
                  <button onClick={() => { setLogoUrl(''); supabase.from('shops').update({ logo_url: null }).eq('id', shop.id) }}
                    className="text-xs text-red-400 hover:text-red-300 mt-1 transition-colors">
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* HERO */}
          <div className="mb-6">
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-3">Hero / Banner Photo</label>
            <div className="w-full h-32 rounded-xl bg-neutral-800 border border-neutral-700 overflow-hidden mb-3 flex items-center justify-center relative">
              {heroUrl ? (
                <img src={heroUrl} alt="Hero" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-neutral-600">No banner photo yet</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => heroRef.current?.click()}
                disabled={uploadingHero}
                className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-xs font-semibold text-neutral-400 hover:border-amber-500 hover:text-amber-500 transition-colors disabled:opacity-50">
                {uploadingHero ? 'Uploading...' : 'Upload Banner Photo'}
              </button>
              <input ref={heroRef} type="file" accept="image/*" onChange={handleHeroUpload} className="hidden" />
              {heroUrl && (
                <button onClick={() => { setHeroUrl(''); supabase.from('shops').update({ hero_url: null }).eq('id', shop.id) }}
                  className="px-4 py-2 bg-neutral-800 border border-red-900 rounded-lg text-xs font-semibold text-red-400 hover:border-red-500 transition-colors">
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-neutral-600 mt-2">Wide photo of your shop. Shown at the top of your booking page. Max 5MB.</p>
          </div>

          {/* BRAND COLOR */}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-3">Brand Color</label>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="w-12 h-12 rounded-lg border border-neutral-700 bg-neutral-800 cursor-pointer p-1"
              />
              <div>
                <div className="text-sm font-mono text-white">{brandColor}</div>
                <div className="text-xs text-neutral-500 mt-0.5">Used on your booking page buttons and accents</div>
              </div>
              <div className="flex gap-2 ml-auto">
                {['#b8861f','#2563eb','#16a34a','#dc2626','#7c3aed','#0891b2'].map(c => (
                  <button key={c} onClick={() => setBrandColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{ background: c, borderColor: brandColor === c ? '#fff' : 'transparent' }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SHOP INFO */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-5">Shop Info</div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Shop Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Tagline</label>
              <input value={tagline} onChange={e => setTagline(e.target.value)}
                placeholder="e.g. Premium cuts in the heart of Jacksonville"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">About Your Shop</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)}
                rows={3} placeholder="Tell clients what makes your shop special..."
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">City</label>
                <input value={city} onChange={e => setCity(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Street Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
            </div>
          </div>
        </div>

        {/* CUSTOM URL */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Custom Booking URL</div>
          <p className="text-xs text-neutral-500 mb-4">Give your shop a clean URL instead of the shop code. Clients will be able to find you at this address.</p>
          <div className="flex items-center gap-0">
            <span className="bg-neutral-800 border border-r-0 border-neutral-700 rounded-l-lg px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">chairos.cc/shop/</span>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="precisehouse"
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-r-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
          </div>
          <p className="text-xs text-neutral-600 mt-2">Lowercase letters, numbers, and hyphens only. e.g. precise-house</p>
        </div>

        {/* PREVIEW */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-4">Booking Page Preview</div>
          <div className="rounded-lg overflow-hidden border border-neutral-700">
            {heroUrl && (
              <div className="h-24 overflow-hidden">
                <img src={heroUrl} alt="Hero" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-4" style={{ background: brandColor + '11' }}>
              <div className="flex items-center gap-3 mb-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-serif text-lg"
                    style={{ background: brandColor + '33', color: brandColor }}>
                    {name[0] || '?'}
                  </div>
                )}
                <div>
                  <div className="font-serif text-white text-base">{name || 'Your Shop Name'}</div>
                  <div className="text-xs text-neutral-400">{tagline || 'Your tagline appears here'}</div>
                </div>
              </div>
              <div className="text-xs text-neutral-500 mb-3">{bio || 'Your shop description appears here'}</div>
              <button className="px-4 py-2 rounded-lg text-xs font-semibold text-black"
                style={{ background: brandColor }}>
                Book Appointment
              </button>
            </div>
          </div>
          <p className="text-xs text-neutral-600 mt-3">
            Your booking page: <span className="text-amber-500 font-mono">
              {slug ? `chairos.cc/shop/${slug}` : `chairos.cc/book/${shop?.shop_code}`}
            </span>
          </p>
        </div>

        {/* HOURS */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-5">Shop Hours</div>
          <div className="space-y-3">
            {hours.map((h, i) => (
              <div key={h.day} className="flex items-center gap-3">
                <div className="w-24 flex-shrink-0">
                  <button
                    onClick={() => setHours(prev => prev.map((d, j) => j === i ? { ...d, open: !d.open } : d))}
                    className={`w-full py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      h.open ? 'bg-amber-500 border-amber-500 text-black' : 'bg-neutral-800 border-neutral-700 text-neutral-500'
                    }`}>
                    {h.day.slice(0, 3)}
                  </button>
                </div>
                {h.open ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={h.from}
                      onChange={e => setHours(prev => prev.map((d, j) => j === i ? { ...d, from: e.target.value } : d))}
                      className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-amber-500 w-28"
                    />
                    <span className="text-neutral-600 text-xs">to</span>
                    <input
                      type="time"
                      value={h.to}
                      onChange={e => setHours(prev => prev.map((d, j) => j === i ? { ...d, to: e.target.value } : d))}
                      className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-amber-500 w-28"
                    />
                  </div>
                ) : (
                  <div className="text-xs text-neutral-600">Closed</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <MobileNav />
    </div>
  )
}