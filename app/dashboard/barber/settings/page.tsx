'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function BarberSettings() {
  const [profile, setProfile] = useState<any>(null)
  const [shopBarber, setShopBarber] = useState<any>(null)
  const [shop, setShop] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const [fullName, setFullName] = useState('')
  const [alias, setAlias] = useState('')
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')

  const photoRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(profile)
    setFullName(profile?.full_name || '')

    const { data: shopBarber } = await supabase
      .from('shop_barbers')
      .select('*, shops(*)')
      .eq('barber_id', user.id)
      .eq('active', true)
      .single()

    if (!shopBarber) { router.push('/join'); return }
    setShopBarber(shopBarber)
    setShop(shopBarber.shops)
    setAlias(shopBarber.alias || '')
    setBio(shopBarber.bio || '')
    setPhotoUrl(shopBarber.photo_url || '')
    setLoading(false)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    setError('')

    const { error: uploadErr } = await supabase.storage
      .from('shop-assets')
      .upload(`barbers/${shopBarber.id}/photo-${Date.now()}`, file, { upsert: true })

    if (uploadErr) { setError(uploadErr.message); setUploadingPhoto(false); return }

    const { data } = supabase.storage
      .from('shop-assets')
      .getPublicUrl(`barbers/${shopBarber.id}/photo-${Date.now()}`)

    // Re-upload to get correct URL
    const path = `barbers/${shopBarber.id}/photo`
    await supabase.storage.from('shop-assets').upload(path, file, { upsert: true })
    const { data: urlData } = supabase.storage.from('shop-assets').getPublicUrl(path)

    setPhotoUrl(urlData.publicUrl)
    await supabase.from('shop_barbers').update({ photo_url: urlData.publicUrl }).eq('id', shopBarber.id)
    setUploadingPhoto(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess('')

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', profile.id)

    if (profileErr) { setError(profileErr.message); setSaving(false); return }

    const { error: barberErr } = await supabase
      .from('shop_barbers')
      .update({ alias, bio })
      .eq('id', shopBarber.id)

    if (barberErr) { setError(barberErr.message); setSaving(false); return }

    setSuccess('Profile updated.')
    setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-amber-500 text-sm">Loading...</div>
    </div>
  )

  const color = shopBarber?.color || '#b8861f'
  const initial = (fullName || shopBarber?.barber_name || 'B')[0].toUpperCase()

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <span className="font-serif text-amber-500 text-lg">ChairOS</span>
        <button onClick={() => router.push('/dashboard/barber')}
          className="text-xs text-neutral-500 hover:text-white transition-colors">
          ← My Dashboard
        </button>
      </header>

      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-white mb-1">My Profile</h1>
          <p className="text-neutral-500 text-sm">{shop?.name} · How clients see you</p>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        {/* PHOTO */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-5">Profile Photo</div>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              {photoUrl ? (
                <img src={photoUrl} alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-4"
                  style={{ borderColor: color }} />
              ) : (
                <div className="w-24 h-24 rounded-full flex items-center justify-center font-serif text-3xl font-bold border-4"
                  style={{ background: color + '22', borderColor: color, color }}>
                  {initial}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm text-white font-medium mb-1">{fullName || shopBarber?.barber_name}</p>
              <p className="text-xs text-neutral-500 mb-3">{shop?.name}</p>
              <button
                onClick={() => photoRef.current?.click()}
                disabled={uploadingPhoto}
                className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-xs font-semibold text-neutral-400 hover:border-amber-500 hover:text-amber-500 transition-colors disabled:opacity-50">
                {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
              </button>
              <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              <p className="text-xs text-neutral-600 mt-2">Square photo works best. Max 2MB.</p>
              {photoUrl && (
                <button
                  onClick={async () => {
                    setPhotoUrl('')
                    await supabase.from('shop_barbers').update({ photo_url: null }).eq('id', shopBarber.id)
                  }}
                  className="text-xs text-red-400 hover:text-red-300 mt-1 transition-colors block">
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* PROFILE INFO */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-5">Profile Info</div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Full Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">
                Chair Name / Specialty
              </label>
              <input value={alias} onChange={e => setAlias(e.target.value)}
                placeholder="e.g. Fade King, The Surgeon"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors" />
              <p className="text-xs text-neutral-600 mt-1">Shown on the booking page under your name</p>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-2">Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)}
                rows={3}
                placeholder="Tell clients about your style, specialties, and experience..."
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-amber-500 transition-colors resize-none" />
              <p className="text-xs text-neutral-600 mt-1">Shown on the shop profile page under your card</p>
            </div>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-neutral-400 mb-4">Booking Page Preview</div>
          <div className="flex flex-col items-center text-center bg-neutral-800 rounded-xl p-5 w-40 mx-auto">
            {photoUrl ? (
              <img src={photoUrl} alt="Preview"
                className="w-14 h-14 rounded-full object-cover mb-3 border-2"
                style={{ borderColor: color }} />
            ) : (
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-serif text-xl font-bold mb-3 border-2"
                style={{ background: color + '22', borderColor: color, color }}>
                {initial}
              </div>
            )}
            <div className="text-sm font-semibold text-white">{fullName || shopBarber?.barber_name || 'Your Name'}</div>
            {alias && <div className="text-xs mt-0.5" style={{ color }}>{alias}</div>}
            {bio && <div className="text-xs text-neutral-500 mt-1 line-clamp-2">{bio}</div>}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}