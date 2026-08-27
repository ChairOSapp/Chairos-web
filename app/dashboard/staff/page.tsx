'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { track } from '@vercel/analytics'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'
import { useVerticalLabels } from '@/lib/VerticalContext'

const COLORS = ['#b8861f','#4a7fb5','#3aab6e','#e07850','#9b6db5','#c06060']
const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

function logAudit(shopId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  fetch('/api/audit/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopId, action, entityType: 'shop_barber', entityId, metadata }),
  }).catch(() => {})
}

export default function ManageBarbers() {
  const { staffLabel, staffLabelPlural } = useVerticalLabels()
  const [shop, setShop] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<{name: string, link: string} | null>(null)

  const [inviteModal, setInviteModal] = useState<{ open: boolean; barber: any | null; value: string }>({ open: false, barber: null, value: '' })
  const [linkModal, setLinkModal] = useState<{ open: boolean; id: string; barberName: string; value: string }>({ open: false, id: '', barberName: '', value: '' })

  const [barberName, setBarberName] = useState('')
  const [barberAlias, setBarberAlias] = useState('')
  const [barberEmail, setBarberEmail] = useState('')
  const [compType, setCompType] = useState<'commission'|'booth_rent'>('commission')
  const [commissionRate, setCommissionRate] = useState('70')
  const [tipSplit, setTipSplit] = useState('100')
  const [boothRent, setBoothRent] = useState('')
  const [rentDueDay, setRentDueDay] = useState('monday')
  const [lateFeeRate, setLateFeeRate] = useState('5')
  const [lateFeeInterval, setLateFeeInterval] = useState<'daily'|'weekly'>('daily')
  const [barberPhotoUrl, setBarberPhotoUrl] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const photoRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: shops } = await supabase
      .from('shops').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: true }).limit(1)
    const shop = shops?.[0] || null
    if (!shop) { router.push('/onboarding'); return }
    setShop(shop)

    const { data: barbers } = await supabase
      .from('shop_barbers').select('*')
      .eq('shop_id', shop.id).order('joined_at', { ascending: true })
    setBarbers(barbers || [])
    setLoading(false)
  }

  function resetForm() {
    setBarberName(''); setBarberAlias(''); setBarberEmail(''); setCompType('commission')
    setCommissionRate('70'); setTipSplit('100'); setBoothRent('')
    setRentDueDay('monday'); setLateFeeRate('5'); setLateFeeInterval('daily')
    setBarberPhotoUrl(''); setUploadingPhoto(false)
    setEditingId(null); setError('')
  }

  function openEdit(b: any) {
    setEditingId(b.id)
    setBarberName(b.barber_name || '')
    setBarberAlias(b.alias || '')
    setBarberEmail('')
    setCompType(b.compensation_type || 'commission')
    setCommissionRate(b.commission_rate ? String(Math.round(b.commission_rate * 100)) : '70')
    setTipSplit(b.tip_split_rate ? String(Math.round(b.tip_split_rate * 100)) : '100')
    setBoothRent(b.booth_rent_amount ? String(b.booth_rent_amount) : '')
    setRentDueDay(b.booth_rent_due_day || 'monday')
    setLateFeeRate(b.late_fee_rate ? String(Math.round(b.late_fee_rate * 100)) : '5')
    setLateFeeInterval(b.late_fee_interval || 'daily')
    setBarberPhotoUrl(b.photo_url || '')
    setShowForm(true)
  }

  async function handleBarberPhotoUpload(e: React.ChangeEvent<HTMLInputElement>, barberId: string) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Photo must be under 2MB'); return }
    setUploadingPhoto(true)
    setError('')
    const path = `barbers/${barberId}/photo`
    const { error: uploadErr } = await supabase.storage.from('shop-assets').upload(path, file, { upsert: true })
    if (uploadErr) { setError(uploadErr.message); setUploadingPhoto(false); return }
    const { data } = supabase.storage.from('shop-assets').getPublicUrl(path)
    await supabase.from('shop_barbers').update({ photo_url: data.publicUrl }).eq('id', barberId)
    setBarberPhotoUrl(data.publicUrl)
    setUploadingPhoto(false)
  }

  async function handleSave() {
    if (!barberName.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')

    const payload = {
      barber_name: barberName.trim(),
      alias: barberAlias.trim() || barberName.trim(),
      compensation_type: compType,
      commission_rate: compType === 'commission' ? parseFloat(commissionRate) / 100 : null,
      tip_split_rate: parseFloat(tipSplit) / 100,
      booth_rent_amount: compType === 'booth_rent' ? parseFloat(boothRent) : null,
      booth_rent_due_day: compType === 'booth_rent' ? rentDueDay : null,
      late_fee_rate: compType === 'booth_rent' ? parseFloat(lateFeeRate) / 100 : null,
      late_fee_interval: compType === 'booth_rent' ? lateFeeInterval : null,
    }

    let shopBarberId: string | null = null

    if (editingId) {
      const { error } = await supabase.from('shop_barbers').update(payload).eq('id', editingId)
      if (error) { setError(error.message); setSaving(false); return }
      shopBarberId = editingId
      const before = barbers.find(b => b.id === editingId)
      logAudit(shop.id, 'staff.compensation_updated', editingId, {
        barber_name: payload.barber_name,
        before: before ? {
          compensation_type: before.compensation_type,
          commission_rate: before.commission_rate,
          tip_split_rate: before.tip_split_rate,
          booth_rent_amount: before.booth_rent_amount,
        } : null,
        after: {
          compensation_type: payload.compensation_type,
          commission_rate: payload.commission_rate,
          tip_split_rate: payload.tip_split_rate,
          booth_rent_amount: payload.booth_rent_amount,
        },
      })
    } else {
      const { data, error } = await supabase.from('shop_barbers').insert({
        ...payload,
        shop_id: shop.id,
        barber_id: null,
        active: true,
        color: COLORS[barbers.length % COLORS.length]
      }).select().single()
      if (error) { setError(error.message); setSaving(false); return }
      shopBarberId = data?.id || null
      track('staff_added', { count: 1, source: 'dashboard' })
    }

    // If email provided and this is a new barber, create invite
    if (barberEmail.trim() && shopBarberId && !editingId) {
      const token = crypto.randomUUID()
      await supabase.from('invites').insert({
        shop_id: shop.id,
        shop_barber_id: shopBarberId,
        email: barberEmail.trim(),
        token,
        accepted: false
      })
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chairos.cc'
      const inviteLink = `${siteUrl}/join?token=${token}`
      setInviteResult({ name: barberName.trim(), link: inviteLink })
    } else {
      setSuccess(editingId ? `${staffLabel} updated.` : `${staffLabel} added.`)
      setTimeout(() => setSuccess(''), 3000)
    }

    resetForm()
    setShowForm(false)
    await loadData()
    setSaving(false)
  }

  async function handleInviteSubmit() {
    const b = inviteModal.barber
    const email = inviteModal.value.trim()
    if (!email || !b) return
    const token = crypto.randomUUID()
    await supabase.from('invites').insert({
      shop_id: shop.id,
      shop_barber_id: b.id,
      email,
      token,
      accepted: false
    })
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chairos.cc'
    const inviteLink = `${siteUrl}/join?token=${token}`
    setInviteResult({ name: b.barber_name || b.alias, link: inviteLink })
    setInviteModal({ open: false, barber: null, value: '' })
  }

  function sendInviteToExisting(b: any) {
    setInviteModal({ open: true, barber: b, value: '' })
  }

  async function toggleActive(id: string, current: boolean) {
    if (current && !confirm(`Deactivate this ${staffLabel.toLowerCase()}? They will no longer appear in bookings.`)) return
    const { error } = await supabase.from('shop_barbers').update({ active: !current }).eq('id', id)
    if (error) { setError(error.message); return }
    if (current) {
      const b = barbers.find(x => x.id === id)
      logAudit(shop.id, 'staff.removed', id, { barber_name: b?.barber_name || b?.alias || null })
    }
    await loadData()
  }

  async function handleLinkSubmit() {
    const { id, barberName: bName, value: email } = linkModal
    if (!email.trim()) return

    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (!prof) {
      setError(`No account found for ${email.trim()}. The ${staffLabel.toLowerCase()} must sign up first at chairos.cc.`)
      setLinkModal(m => ({ ...m, open: false }))
      return
    }

    const { error } = await supabase
      .from('shop_barbers')
      .update({ barber_id: prof.id })
      .eq('id', id)

    if (error) { setError(error.message); setLinkModal(m => ({ ...m, open: false })); return }
    setSuccess(`${bName} linked successfully.`)
    setTimeout(() => setSuccess(''), 3000)
    setLinkModal({ open: false, id: '', barberName: '', value: '' })
    await loadData()
  }

  function markAsLinked(id: string, bName: string) {
    setLinkModal({ open: true, id, barberName: bName, value: '' })
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0,2).toUpperCase() || 'CH'

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shop?.name} ownerName={''} initials={initials} userId={userId || undefined} />

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-0">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Manage {staffLabelPlural}</h1>
            <p className="text-charcoal-500 text-sm">{shop?.name} · {barbers.filter(b => b.active).length} active</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/dashboard/staff/requests')}
              className="border border-od-green/40 text-od-green bg-od-green/10 hover:bg-od-green/20 font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
              Review Join Requests
            </button>
            <button
              onClick={() => { resetForm(); setInviteResult(null); setShowForm(!showForm) }}
              className="bg-od-green hover:bg-od-green-light text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
              + Add {staffLabel}
            </button>
          </div>
        </div>

        {error && !showForm && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        {/* INVITE RESULT */}
        {inviteResult && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5 mb-6">
            <div className="text-sm font-semibold text-green-400 mb-1">
              {inviteResult.name} added — invite link ready
            </div>
            <div className="text-xs text-charcoal-400 mb-3">
              Send this link to {inviteResult.name}. They'll use it to claim their account.
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 font-mono text-xs text-od-green bg-warm-100 border border-warm-300 rounded-lg px-3 py-2 truncate">
                {inviteResult.link}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteResult.link)
                  setSuccess('Link copied!')
                  setTimeout(() => setSuccess(''), 2000)
                }}
                className="bg-od-green hover:bg-od-green-light text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors flex-shrink-0">
                Copy Link
              </button>
            </div>
            <button onClick={() => setInviteResult(null)} className="text-xs text-charcoal-600 hover:text-charcoal-400 mt-3 transition-colors">
              Dismiss
            </button>
          </div>
        )}

        {showForm && (
          <div className="bg-warm-100 border border-warm-200 rounded-xl p-6 mb-6">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">
              {editingId ? `Edit ${staffLabel}` : `New ${staffLabel}`}
            </div>
            {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-4">{error}</p>}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">First Name *</label>
                <input value={barberName} onChange={e => setBarberName(e.target.value)} placeholder="Marcus"
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              </div>
              <div>
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Alias / Specialty</label>
                <input value={barberAlias} onChange={e => setBarberAlias(e.target.value)} placeholder="Fade King"
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
              </div>
            </div>

            {!editingId && (
              <div className="mb-4">
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">
                  Email — Invite to ChairOS
                  <span className="ml-2 normal-case text-charcoal-600 font-normal tracking-normal">optional</span>
                </label>
                <input
                  type="email"
                  value={barberEmail}
                  onChange={e => setBarberEmail(e.target.value)}
                  placeholder="barber@email.com"
                  className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                <p className="text-xs text-charcoal-600 mt-1">An invite link will be generated for you to share with them.</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Compensation</label>
              <div className="grid grid-cols-2 gap-2">
                {(['commission','booth_rent'] as const).map(t => (
                  <button key={t} onClick={() => setCompType(t)}
                    className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${compType === t ? 'bg-od-green border-od-green text-white' : 'bg-warm-200 border-warm-300 text-charcoal-400'}`}>
                    {t === 'commission' ? 'Commission' : 'Booth Rent'}
                  </button>
                ))}
              </div>
            </div>

            {compType === 'commission' && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">{staffLabel} Commission %</label>
                  <div className="relative">
                    <input type="number" min="1" max="100" value={commissionRate} onChange={e => setCommissionRate(e.target.value)}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green pr-8" />
                    <span className="absolute right-3 top-3 text-charcoal-400 text-sm">%</span>
                  </div>
                  <div className="text-xs text-charcoal-500 mt-1">Shop keeps {100 - parseInt(commissionRate || '0')}%</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">{staffLabel} Tip %</label>
                  <div className="relative">
                    <input type="number" min="1" max="100" value={tipSplit} onChange={e => setTipSplit(e.target.value)}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green pr-8" />
                    <span className="absolute right-3 top-3 text-charcoal-400 text-sm">%</span>
                  </div>
                  <div className="text-xs text-charcoal-500 mt-1">Default 100% to {staffLabel.toLowerCase()}</div>
                </div>
              </div>
            )}

            {compType === 'booth_rent' && (
              <div className="space-y-4 mb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Weekly Rent $</label>
                    <input type="number" value={boothRent} onChange={e => setBoothRent(e.target.value)} placeholder="150"
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Due Every</label>
                    <select value={rentDueDay} onChange={e => setRentDueDay(e.target.value)}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green">
                      {DAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Late Fee %</label>
                    <div className="relative">
                      <input type="number" value={lateFeeRate} onChange={e => setLateFeeRate(e.target.value)} placeholder="5"
                        className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green pr-8" />
                      <span className="absolute right-3 top-3 text-charcoal-400 text-sm">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Applied Per</label>
                    <select value={lateFeeInterval} onChange={e => setLateFeeInterval(e.target.value as any)}
                      className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green">
                      <option value="daily">Day</option>
                      <option value="weekly">Week</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {editingId && (
              <div className="mb-4">
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">{staffLabel} Photo</label>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 border-2 border-warm-300">
                    {barberPhotoUrl ? (
                      <img src={barberPhotoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-warm-200 flex items-center justify-center font-serif text-lg text-charcoal-500">
                        {barberName[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => photoRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="px-4 py-2 bg-warm-200 border border-warm-300 rounded-lg text-xs font-semibold text-charcoal-400 hover:border-od-green hover:text-od-green transition-colors disabled:opacity-50">
                      {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                    </button>
                    <input
                      ref={photoRef}
                      type="file"
                      accept="image/*"
                      onChange={e => handleBarberPhotoUpload(e, editingId)}
                      className="hidden"
                    />
                    <p className="text-xs text-charcoal-600 mt-1">Shows on booking page</p>
                  </div>
                </div>
              </div>
            )}
            {!editingId && (
              <div className="mb-4">
                <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-3">{staffLabel} Photo</label>
                <p className="text-xs text-charcoal-600">Save the {staffLabel.toLowerCase()} first, then edit them to upload a photo.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { resetForm(); setShowForm(false) }}
                className="px-6 py-2.5 bg-warm-200 border border-warm-300 rounded-lg text-sm text-charcoal-400 hover:text-charcoal-900 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-od-green hover:bg-od-green-light text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : barberEmail ? 'Add & Generate Invite' : `Add ${staffLabel}`}
              </button>
            </div>
          </div>
        )}

        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          {barbers.length === 0 ? (
            <div className="p-8 text-center text-charcoal-500 text-sm">No {staffLabelPlural.toLowerCase()} yet. Add your first {staffLabel.toLowerCase()} above.</div>
          ) : (
            <div className="divide-y divide-warm-200">
              {barbers.map((b, i) => (
                <div key={b.id} className={`px-5 py-4 ${!b.active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm font-bold flex-shrink-0"
                      style={{ background: (b.color || COLORS[i % COLORS.length]) + '22', border: `2px solid ${b.color || COLORS[i % COLORS.length]}`, color: b.color || COLORS[i % COLORS.length] }}>
                      {(b.barber_name || b.alias || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-charcoal-900">{b.barber_name || b.alias}</div>
                      <div className="text-xs text-charcoal-500 mt-0.5">
                        {b.compensation_type === 'commission'
                          ? `${Math.round((b.commission_rate || 0.7) * 100)}% commission · Tips ${Math.round((b.tip_split_rate || 1) * 100)}%`
                          : `Booth rent $${b.booth_rent_amount}/wk · Due ${b.booth_rent_due_day}`}
                      </div>
                    </div>
                    <div className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${b.barber_id ? 'bg-green-500/10 text-green-500' : 'bg-warm-200 text-charcoal-500'}`}>
                      {b.barber_id ? 'Linked' : 'Pending'}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap ml-13">
                    {!b.barber_id && b.active && (
                      <button onClick={() => sendInviteToExisting(b)}
                        className="px-3 py-1.5 bg-od-green/10 border border-od-green/30 rounded-lg text-xs text-od-green hover:bg-od-green hover:text-white transition-colors font-semibold">
                        Invite
                      </button>
                    )}
                    {!b.barber_id && b.active && (
                      <button onClick={() => markAsLinked(b.id, b.barber_name || b.alias)}
                        className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-400 hover:bg-blue-500 hover:text-white transition-colors font-semibold">
                        Link
                      </button>
                    )}
                    <button onClick={() => openEdit(b)}
                      className="px-3 py-1.5 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-400 hover:border-od-green hover:text-od-green transition-colors">
                      Edit
                    </button>
                    <button onClick={() => router.push(`/dashboard/staff/${b.id}/earnings`)}
                      className="px-3 py-1.5 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-400 hover:border-green-500 hover:text-green-400 transition-colors">
                      Earnings
                    </button>
                    <button onClick={() => toggleActive(b.id, b.active)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        b.active
                          ? 'bg-warm-200 border-warm-300 text-charcoal-400 hover:border-red-500 hover:text-red-400'
                          : 'bg-green-500/10 border-green-500/30 text-green-500'
                      }`}>
                      {b.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <MobileNav />

      {/* Invite Modal */}
      {inviteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-warm-50 border border-warm-200 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-4">
              Invite {inviteModal.barber?.barber_name || inviteModal.barber?.alias}
            </div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Email Address</label>
            <input
              type="email"
              value={inviteModal.value}
              onChange={e => setInviteModal(m => ({ ...m, value: e.target.value }))}
              placeholder="barber@email.com"
              autoFocus
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setInviteModal({ open: false, barber: null, value: '' })}
                className="flex-1 px-4 py-2.5 bg-warm-200 border border-warm-300 rounded-lg text-sm text-charcoal-400 hover:text-charcoal-900 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleInviteSubmit}
                disabled={!inviteModal.value.trim()}
                className="flex-1 bg-od-green hover:bg-od-green-light text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Modal */}
      {linkModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-warm-50 border border-warm-200 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-1">
              Link {linkModal.barberName}
            </div>
            <p className="text-xs text-charcoal-500 mb-4">Enter the account email for {linkModal.barberName} to link them manually.</p>
            <label className="block text-xs font-semibold tracking-widest uppercase text-charcoal-400 mb-2">Account Email</label>
            <input
              type="email"
              value={linkModal.value}
              onChange={e => setLinkModal(m => ({ ...m, value: e.target.value }))}
              placeholder="barber@email.com"
              autoFocus
              className="w-full bg-warm-200 border border-warm-300 rounded-lg px-4 py-3 text-charcoal-900 text-sm outline-none focus:border-od-green mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setLinkModal({ open: false, id: '', barberName: '', value: '' })}
                className="flex-1 px-4 py-2.5 bg-warm-200 border border-warm-300 rounded-lg text-sm text-charcoal-400 hover:text-charcoal-900 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleLinkSubmit}
                disabled={!linkModal.value.trim()}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                Link {staffLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}