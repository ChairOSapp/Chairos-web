'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import OwnerNav from '@/components/OwnerNav'
import MobileNav from '@/components/MobileNav'

interface Template {
  id: string
  version: number
  is_active: boolean
  uploaded_at: string
}

function logAudit(shopId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  fetch('/api/audit/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopId, action, entityType: 'consent_form_template', entityId, metadata }),
  }).catch(() => {})
}

interface SignatureRecord {
  id: string
  signed_at: string
  template_version: number
  clients: { full_name: string | null; phone: string | null } | null
}

export default function ConsentFormsPage() {
  const [shop, setShop] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [signatures, setSignatures] = useState<SignatureRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

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

    const { data: templateRows } = await supabase
      .from('consent_form_templates')
      .select('id, version, is_active, uploaded_at')
      .eq('shop_id', shop.id)
      .order('version', { ascending: false })
    setTemplates(templateRows || [])

    const { data: signatureRows } = await supabase
      .from('consent_form_signatures')
      .select('id, signed_at, template_version, clients(full_name, phone)')
      .eq('shop_id', shop.id)
      .order('signed_at', { ascending: false })
    setSignatures((signatureRows as any) || [])

    setLoading(false)
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { setError('Please upload a PDF file'); return }
    setUploading(true)
    setError('')
    setSuccess('')

    const nextVersion = (templates[0]?.version || 0) + 1
    const path = `${shop.id}/${nextVersion}-${crypto.randomUUID()}.pdf`

    const { error: uploadErr } = await supabase.storage
      .from('consent-templates')
      .upload(path, file, { contentType: 'application/pdf' })
    if (uploadErr) { setError(uploadErr.message); setUploading(false); return }

    const newTemplateId = crypto.randomUUID()
    const { error: insertErr } = await supabase.from('consent_form_templates').insert({
      id: newTemplateId,
      shop_id: shop.id,
      vertical: shop.vertical,
      file_path: path,
      version: nextVersion,
      is_active: true,
    })
    if (insertErr) { setError(insertErr.message); setUploading(false); return }

    // Only one active template per shop — deactivate the rest now that the
    // new version is confirmed active, so there's never a window where
    // zero templates are active (which would trip the confirmation block).
    await supabase.from('consent_form_templates')
      .update({ is_active: false })
      .eq('shop_id', shop.id)
      .neq('version', nextVersion)

    logAudit(shop.id, 'consent_template.uploaded', newTemplateId, { version: nextVersion, file_name: file.name })

    setSuccess(`Version ${nextVersion} uploaded and activated.`)
    if (fileRef.current) fileRef.current.value = ''
    setUploading(false)
    await loadData()
  }

  async function activate(templateId: string) {
    setError('')
    await supabase.from('consent_form_templates').update({ is_active: true }).eq('id', templateId)
    await supabase.from('consent_form_templates').update({ is_active: false }).eq('shop_id', shop.id).neq('id', templateId)
    await loadData()
  }

  async function deactivate(templateId: string) {
    setError('')
    await supabase.from('consent_form_templates').update({ is_active: false }).eq('id', templateId)
    await loadData()
  }

  async function viewSigned(signatureId: string) {
    const { data } = await supabase
      .from('consent_form_signatures')
      .select('signed_pdf_path')
      .eq('id', signatureId)
      .maybeSingle()
    if (!data) return
    const { data: signedUrlData } = await supabase.storage
      .from('consent-signed')
      .createSignedUrl(data.signed_pdf_path, 900)
    if (signedUrlData?.signedUrl) window.open(signedUrlData.signedUrl, '_blank')
  }

  if (loading) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const initials = shop?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase() || 'CH'
  const activeTemplate = templates.find(t => t.is_active)

  return (
    <div className="min-h-screen bg-warm-50">
      <OwnerNav shopName={shop?.name} ownerName={''} initials={initials} userId={userId || undefined} />

      <div className="p-6 max-w-3xl mx-auto pb-20 md:pb-0">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Consent Forms</h1>
          <p className="text-charcoal-500 text-sm">
            Upload your attorney-sourced consent form — ChairOS makes it interactive, not legal advice.
            {shop?.vertical === 'tattoo' && ' Tattoo bookings cannot be confirmed without an active version.'}
          </p>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
        {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

        {shop?.vertical === 'tattoo' && !activeTemplate && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-700">
            No active consent form — tattoo appointments cannot be confirmed until you upload one.
          </div>
        )}

        <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Upload New Version</div>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="application/pdf" className="text-sm text-charcoal-700" />
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="bg-od-green hover:bg-od-green-light text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          <p className="text-xs text-charcoal-500 mt-2">Each upload creates a new version. The previous version stays on file for existing signed records but is deactivated.</p>
        </div>

        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-warm-200 font-serif text-charcoal-900 text-sm">Versions</div>
          {templates.length === 0 ? (
            <div className="p-6 text-center text-charcoal-500 text-sm">No consent form uploaded yet.</div>
          ) : (
            <div className="divide-y divide-warm-200">
              {templates.map(t => (
                <div key={t.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-charcoal-900">Version {t.version}</div>
                    <div className="text-xs text-charcoal-500">{new Date(t.uploaded_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.is_active ? 'bg-green-500/10 text-green-600' : 'bg-warm-200 text-charcoal-500'}`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {t.is_active ? (
                      <button onClick={() => deactivate(t.id)} className="px-3 py-1.5 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-500 hover:border-red-400 hover:text-red-400 transition-colors">
                        Deactivate
                      </button>
                    ) : (
                      <button onClick={() => activate(t.id)} className="px-3 py-1.5 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-500 hover:border-od-green hover:text-od-green transition-colors">
                        Activate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-warm-100 border border-warm-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-warm-200 font-serif text-charcoal-900 text-sm">Signed Records ({signatures.length})</div>
          {signatures.length === 0 ? (
            <div className="p-6 text-center text-charcoal-500 text-sm">No signed consent forms yet.</div>
          ) : (
            <div className="divide-y divide-warm-200">
              {signatures.map(s => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-charcoal-900">{s.clients?.full_name || 'Unknown client'}</div>
                    <div className="text-xs text-charcoal-500">v{s.template_version} · {new Date(s.signed_at).toLocaleString()}</div>
                  </div>
                  <button onClick={() => viewSigned(s.id)} className="px-3 py-1.5 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-500 hover:border-od-green hover:text-od-green transition-colors">
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <MobileNav />
    </div>
  )
}
