'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Template {
  id: string
  version: number
  is_active: boolean
  uploaded_at: string
  file_path: string | null
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

// Consent template manager, extracted from the old standalone
// /dashboard/consent page so it can live as a tab inside Shop Settings.
// Renders only its content: the host page provides nav and layout.
export default function ConsentManager() {
  const [shop, setShop] = useState<any>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [signatures, setSignatures] = useState<SignatureRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string>('')
  const [showSignModal, setShowSignModal] = useState(false)
  const [todayAppts, setTodayAppts] = useState<any[]>([])
  const [loadingAppts, setLoadingAppts] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
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

    const { data: templateRows } = await supabase
      .from('consent_form_templates')
      .select('id, version, is_active, uploaded_at, file_path')
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
    if (!file) {
      setError('Please choose a PDF file first, then tap Upload.')
      return
    }
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
    setSelectedFileName('')
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
    if (!data?.signed_pdf_path) {
      setError('Signed PDF not found for this record.')
      return
    }
    const { data: signedUrlData, error } = await supabase.storage
      .from('consent-signed')
      .createSignedUrl(data.signed_pdf_path, 900)
    if (error || !signedUrlData?.signedUrl) {
      setError('Could not open the signed PDF: ' + (error?.message || 'unknown error'))
      return
    }
    setViewerUrl(signedUrlData.signedUrl)
  }

  async function viewTemplate(filePath: string | null) {
    if (!filePath) {
      setError('Template file not found.')
      return
    }
    const { data: signedUrlData, error } = await supabase.storage
      .from('consent-templates')
      .createSignedUrl(filePath, 900)
    if (error || !signedUrlData?.signedUrl) {
      setError('Could not open the template PDF: ' + (error?.message || 'unknown error'))
      return
    }
    setViewerUrl(signedUrlData.signedUrl)
  }

  async function openSignModal() {
    setShowSignModal(true)
    setLoadingAppts(true)
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('appointments')
      .select('id, client_name, date, time, services(name)')
      .eq('shop_id', shop.id)
      .eq('date', today)
      .order('time', { ascending: true })
      .limit(20)
    setTodayAppts(data || [])
    setLoadingAppts(false)
  }

  if (loading) return (
    <div className="text-center py-12">
      <div className="text-od-green text-sm">Loading...</div>
    </div>
  )

  const activeTemplate = templates.find(t => t.is_active)

  return (
    <>
      <div className="mb-8">
        <h1 className="font-serif text-2xl text-charcoal-900 mb-1">Consent Forms</h1>
        <p className="text-charcoal-500 text-sm">
          Upload your consent form. ChairOS makes it signable, not legal advice.
          {shop?.require_consent_form && ' Bookings cannot be confirmed without an active version.'}
        </p>
      </div>

      {error && <p className="text-red-400 text-sm bg-red-950 border border-red-900 rounded-lg p-3 mb-6">{error}</p>}
      {success && <p className="text-green-400 text-sm bg-green-950 border border-green-900 rounded-lg p-3 mb-6">{success}</p>}

      {shop?.require_consent_form && !activeTemplate && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-700">
          No active consent form. Appointments cannot be confirmed until you upload one.
        </div>
      )}

      <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-4">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Build one for your state</div>
        <p className="text-sm text-charcoal-500 mb-4">
          Pick your state and what you do — ChairOS generates a consent form with that state's legal minimum baked in. Tattoo rules are state-specific and verified.
        </p>
        <button
          onClick={() => router.push('/dashboard/consent/build')}
          className="btn-chairos w-full"
        >
          🛠️ Build a consent form
        </button>
      </div>

      <div className="bg-warm-100 border border-warm-200 rounded-xl p-5 mb-6">
        <div className="text-xs font-semibold tracking-widest uppercase text-charcoal-500 mb-3">Or upload your own</div>
        <div className="flex flex-col gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name || '')}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full px-4 py-3 border-2 border-dashed border-warm-300 rounded-lg text-sm text-charcoal-700 bg-white/50 hover:border-charcoal-400 transition-colors text-center"
          >
            {selectedFileName ? (
              <span className="font-semibold text-charcoal-900">📄 {selectedFileName}</span>
            ) : (
              <span><span className="font-semibold">Step 1:</span> Tap to choose a PDF file</span>
            )}
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFileName}
            className="btn-chairos w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading…' : 'Step 2: Upload'}
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
                  <button onClick={() => viewTemplate(t.file_path)} className="btn-chairos-outline">
                    View
                  </button>
                  {t.is_active ? (
                    <button onClick={() => deactivate(t.id)} className="px-3 py-1.5 bg-warm-200 border border-warm-300 rounded-lg text-xs text-charcoal-500 hover:border-red-400 hover:text-red-400 transition-colors">
                      Deactivate
                    </button>
                  ) : (
                    <button onClick={() => activate(t.id)} className="btn-chairos-outline">
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
        <div className="px-5 py-4 border-b border-warm-200 flex items-center justify-between">
          <span className="font-serif text-charcoal-900 text-sm">Signed Records ({signatures.length})</span>
          <button
            onClick={openSignModal}
            className="btn-chairos-outline text-xs"
          >
            ✍️ Sign on this device
          </button>
        </div>
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
                <button onClick={() => viewSigned(s.id)} className="btn-chairos-outline">
                  View
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewerUrl && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" onClick={() => setViewerUrl(null)}>
          <div className="flex items-center justify-between p-4 bg-black">
            <span className="text-white text-sm font-semibold">Consent Form</span>
            <button
              onClick={() => setViewerUrl(null)}
              className="text-white text-sm px-4 py-2 bg-white/20 rounded-lg font-semibold"
            >
              ✕ Close
            </button>
          </div>
          <div className="flex-1 bg-white" onClick={(e) => e.stopPropagation()}>
            <object
              data={viewerUrl}
              type="application/pdf"
              className="w-full h-full"
            >
              <div className="p-8 text-center">
                <p className="text-charcoal-700 mb-4">Unable to display PDF inline.</p>
                <a
                  href={viewerUrl}
                  className="btn-chairos"
                >
                  Open PDF
                </a>
              </div>
            </object>
          </div>
        </div>
      )}

      {showSignModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowSignModal(false)}>
          <div className="bg-warm-50 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-warm-200">
              <span className="font-semibold text-charcoal-900 text-sm">Select appointment for in-person signing</span>
              <button onClick={() => setShowSignModal(false)} className="text-charcoal-500 text-lg px-2">✕</button>
            </div>
            <div className="overflow-y-auto p-4">
              {loadingAppts ? (
                <p className="text-center text-charcoal-500 text-sm py-8">Loading today's appointments…</p>
              ) : todayAppts.length === 0 ? (
                <p className="text-center text-charcoal-500 text-sm py-8">No appointments today. The client needs an appointment to sign against.</p>
              ) : (
                <div className="space-y-2">
                  {todayAppts.map(a => (
                    <button
                      key={a.id}
                      onClick={() => window.location.href = `/consent/${a.id}`}
                      className="w-full text-left p-3 bg-white border border-warm-200 rounded-lg hover:border-charcoal-400 transition-colors"
                    >
                      <div className="font-semibold text-charcoal-900 text-sm">{a.client_name}</div>
                      <div className="text-xs text-charcoal-500">{a.time?.slice(0,5)} · {a.services?.name || 'Service'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
