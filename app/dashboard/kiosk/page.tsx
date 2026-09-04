'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import StaffNav from '@/components/StaffNav'
import MobileNav from '@/components/MobileNav'
import { KIOSK_DEFAULT_ACCENT, KIOSK_DEFAULT_PRIMARY, type KioskDisplayMode } from '@/lib/kioskConfig'

const MODES: { value: KioskDisplayMode; label: string; description: string }[] = [
  { value: 'off', label: 'Off', description: 'Just the check-in form, nothing else' },
  { value: 'queue', label: 'Queue only', description: 'Show the waiting list' },
  { value: 'slots', label: 'Open slots only', description: "Show today's open times" },
  { value: 'both', label: 'Both', description: 'Waiting list and open slots' },
]

export default function KioskSettings() {
  const [shop, setShop] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [myBarberRow, setMyBarberRow] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [displayMode, setDisplayMode] = useState<KioskDisplayMode>('both')
  const [primaryColor, setPrimaryColor] = useState(KIOSK_DEFAULT_PRIMARY)
  const [accentColor, setAccentColor] = useState(KIOSK_DEFAULT_ACCENT)
  const [logoUrl, setLogoUrl] = useState('')

  const logoRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    setProfile(prof)

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shop = shops?.[0] || null
    if (!shop) { router.push('/onboarding'); return }
    setShop(shop)

    if (prof?.role === 'barber') {
      const { data: sb } = await supabase.from('shop_barbers').select('barber_name, alias, color, photo_url')
        .eq('shop_id', shop.id).eq('barber_id', user.id).maybeSingle()
      setMyBarberRow(sb)
    }

    const { data: kc } = await supabase.from('kiosk_config').select('*').eq('shop_id', shop.id).maybeSingle()
    if (kc) {
      setDisplayMode(kc.display_mode)
      setPrimaryColor(kc.primary_color || KIOSK_DEFAULT_PRIMARY)
      setAccentColor(kc.accent_color || KIOSK_DEFAULT_ACCENT)
      setLogoUrl(kc.logo_url || '')
    }

    setLoading(false)
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('File too large. Maximum size is 2MB'); return }
    setUploadingLogo(true)
    setError('')
    const { error: uploadErr } = await supabase.storage
      .from('shop-assets')
      .upload(`${shop.id}/kiosk-logo`, file, { upsert: true })
    if (uploadErr) { setError(uploadErr.message); setUploadingLogo(false); return }
    const { data } = supabase.storage.from('shop-assets').getPublicUrl(`${shop.id}/kiosk-logo`)
    setLogoUrl(`${data.publicUrl}?t=${Date.now()}`)
    setUploadingLogo(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error: saveErr } = await supabase.from('kiosk_config').upsert({
      shop_id: shop.id,
      display_mode: displayMode,
      primary_color: primaryColor,
      accent_color: accentColor,
      logo_url: logoUrl || null,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (saveErr) { setError(saveErr.message); return }
    setSuccess('Kiosk settings saved.')
    setTimeout(() => setSuccess(''), 3000)
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-warm-50">
      {profile?.role === 'barber' ? (
        <StaffNav
          shopName={shop?.name || ''}
          barberName={myBarberRow?.barber_name || myBarberRow?.alias || profile?.full_name || 'You'}
          color={myBarberRow?.color || '#b8861f'}
          initial={(myBarberRow?.barber_name || myBarberRow?.alias || profile?.full_name || 'S')[0].toUpperCase()}
          photoUrl={myBarberRow?.photo_url || undefined}
          userId={userId || undefined}
        />
      ) : (
        <OwnerNav shopName={shop?.name} ownerName={''} initials={initials} userId={userId || undefined} />
      )}

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-0">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Kiosk Display</h1>
          <p className="text-charcoal-500 text-sm">{shop?.name} · what clients see at the front-counter tablet</p>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        {/* DISPLAY MODE */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">What to Show</div>
          <div className="grid grid-cols-2 gap-3">
            {MODES.map(m => (
              <button key={m.value} onClick={() => setDisplayMode(m.value)}
                className={`text-left p-3 rounded-lg border-2 transition-all ${displayMode === m.value ? 'border-od-green bg-od-green/5' : 'border-warm-300 bg-warm-200'}`}>
                <div className="text-sm font-semibold text-charcoal-900">{m.label}</div>
                <div className="text-xs text-charcoal-500 mt-0.5">{m.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* BRANDING */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-5">Branding</div>

          <div className="mb-6">
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Kiosk Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-warm-200 border border-warm-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="Kiosk logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-serif text-2xl text-charcoal-600">{shop?.name?.[0] || '?'}</span>
                )}
              </div>
              <div>
                <button onClick={() => logoRef.current?.click()} disabled={uploadingLogo}
                  className="px-4 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs font-semibold text-charcoal-400 hover:border-od-green hover:text-od-green transition-colors disabled:opacity-50">
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                </button>
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <p className="text-xs text-charcoal-600 mt-2">Defaults to your shop logo if left blank. Max 2MB.</p>
                {logoUrl && (
                  <button onClick={() => setLogoUrl('')} className="text-xs text-red-400 hover:text-red-300 mt-1 transition-colors">
                    Use shop logo instead
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Primary Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                  className="w-12 h-12 rounded-lg border border-warm-300 bg-warm-200 cursor-pointer p-1" />
                <div className="text-sm font-mono text-charcoal-900">{primaryColor}</div>
              </div>
              <p className="text-xs text-charcoal-500 mt-2">Headings and the check-in button</p>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">Accent Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                  className="w-12 h-12 rounded-lg border border-warm-300 bg-warm-200 cursor-pointer p-1" />
                <div className="text-sm font-mono text-charcoal-900">{accentColor}</div>
              </div>
              <p className="text-xs text-charcoal-500 mt-2">Queue badges and time slot chips</p>
            </div>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">Kiosk Preview</div>
          <div className="rounded-lg overflow-hidden border border-warm-300 bg-warm-50 p-4">
            <div className="flex items-center gap-3 mb-4">
              {logoUrl || shop?.logo_url ? (
                <img src={logoUrl || shop.logo_url} alt="Logo" className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-serif text-lg"
                  style={{ background: primaryColor + '20', color: primaryColor }}>
                  {shop?.name?.[0] || '?'}
                </div>
              )}
              <div className="font-serif text-base" style={{ color: primaryColor }}>{shop?.name || 'Your Shop'}</div>
            </div>
            {displayMode !== 'off' && (
              <div className="grid grid-cols-2 gap-3">
                {(displayMode === 'queue' || displayMode === 'both') && (
                  <div className="bg-warm-100 border border-warm-200 rounded-lg p-3">
                    <div className="text-xs font-semibold mb-2" style={{ color: primaryColor }}>Waiting List</div>
                    <div className="flex items-center gap-2 bg-warm-50 border border-warm-200 rounded-md px-2 py-1.5 mb-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white" style={{ background: accentColor }}>JD</div>
                      <div className="text-[11px] text-charcoal-700">#1 in line</div>
                    </div>
                    <div className="flex items-center gap-2 bg-warm-50 border border-warm-200 rounded-md px-2 py-1.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white" style={{ background: accentColor }}>MK</div>
                      <div className="text-[11px] text-charcoal-700">#2 in line</div>
                    </div>
                  </div>
                )}
                {(displayMode === 'slots' || displayMode === 'both') && (
                  <div className="bg-warm-100 border border-warm-200 rounded-lg p-3">
                    <div className="text-xs font-semibold mb-2" style={{ color: primaryColor }}>Open Today</div>
                    <div className="text-[11px] text-charcoal-700 mb-1.5">Alex</div>
                    <div className="flex flex-wrap gap-1">
                      {['2:00 PM', '2:30 PM', '3:30 PM'].map(t => (
                        <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: accentColor + '1a', color: accentColor }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button className="w-full mt-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: primaryColor }}>
              Text Me a Code
            </button>
          </div>
          <p className="text-xs text-charcoal-600 mt-3">
            Kiosk link: <span className="text-od-green font-mono">chairos.cc/kiosk/{shop?.shop_code}</span>
          </p>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="bg-od-green hover:bg-od-green-light text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Kiosk Settings'}
        </button>
      </div>

      <MobileNav />
    </div>
  )
}
