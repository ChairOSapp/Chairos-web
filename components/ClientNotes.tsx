'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useVerticalLabels } from '@/lib/VerticalContext'

type Note = {
  id: string
  body: string
  photo_paths: string[]
  author_name: string | null
  created_at: string
}

const NOTE_PLACEHOLDER: Record<string, string> = {
  barbershop: 'Cut preference, fade guard length, anything to remember for next time.',
  salon: 'Color formula, treatment notes, anything to remember for next time.',
  tattoo: 'Session notes, design direction, what the client wants to achieve across sessions.',
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024

export default function ClientNotes({
  clientId,
  shopId,
  mode = 'full',
  dark = false,
}: {
  clientId: string
  shopId: string
  mode?: 'full' | 'add-only'
  dark?: boolean
}) {
  const { vertical } = useVerticalLabels()
  const supabase = useMemo(() => createClient(), [])

  const [notes, setNotes] = useState<Note[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(mode === 'full')
  const [expanded, setExpanded] = useState(mode === 'full')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const loadNotes = useCallback(async () => {
    if (mode !== 'full') return
    setLoading(true)
    const { data } = await supabase
      .from('client_notes')
      .select('id, body, photo_paths, author_name, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    setNotes(data || [])
    setLoading(false)

    for (const n of data || []) {
      if (n.photo_paths?.length) {
        const urls: string[] = []
        for (const p of n.photo_paths) {
          const { data: signed } = await supabase.storage.from('client-notes').createSignedUrl(p, 900)
          if (signed?.signedUrl) urls.push(signed.signedUrl)
        }
        setPhotoUrls(prev => ({ ...prev, [n.id]: urls }))
      }
    }
  }, [clientId, mode, supabase])

  useEffect(() => { loadNotes() }, [loadNotes])

  async function handleSave() {
    if (!body.trim() && files.length === 0) { setError('Add a note or a photo.'); return }
    for (const f of files) {
      if (f.size > MAX_PHOTO_BYTES) { setError('Each photo must be under 8MB.'); return }
    }
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in.'); setSaving(false); return }

    const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle()
    let authorName = profile?.full_name || 'Staff'
    if (profile?.role === 'barber') {
      const { data: sb } = await supabase.from('shop_barbers').select('barber_name, alias').eq('barber_id', user.id).eq('shop_id', shopId).maybeSingle()
      authorName = sb?.barber_name || sb?.alias || authorName
    } else if (profile?.role === 'owner') {
      authorName = `${authorName} (Owner)`
    }

    const noteId = crypto.randomUUID()
    const photoPaths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${shopId}/${noteId}/${i}.${ext}`
      const { error: upErr } = await supabase.storage.from('client-notes').upload(path, file)
      if (upErr) { setError(upErr.message); setSaving(false); return }
      photoPaths.push(path)
    }

    const { error: insErr } = await supabase.from('client_notes').insert({
      id: noteId,
      client_id: clientId,
      shop_id: shopId,
      author_id: user.id,
      author_name: authorName,
      body: body.trim(),
      photo_paths: photoPaths,
    })
    if (insErr) { setError(insErr.message); setSaving(false); return }

    setBody('')
    setFiles([])
    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 2500)
    if (mode === 'add-only') setExpanded(false)
    await loadNotes()
  }

  const placeholder = NOTE_PLACEHOLDER[vertical] || NOTE_PLACEHOLDER.barbershop

  const cardBg = dark ? 'bg-charcoal-900 border-charcoal-700' : 'bg-warm-100 border-warm-200'
  const headerBorder = dark ? 'border-charcoal-700' : 'border-warm-200'
  const titleColor = dark ? 'text-white' : 'text-charcoal-900'
  const mutedColor = dark ? 'text-charcoal-500' : 'text-charcoal-500'
  const bodyColor = dark ? 'text-charcoal-300' : 'text-charcoal-600'
  const inputBg = dark ? 'bg-charcoal-800 border-charcoal-700 text-white' : 'bg-warm-200 border-warm-300 text-charcoal-900'

  return (
    <div className={`${cardBg} border rounded-xl overflow-hidden`}>
      {mode === 'full' && (
        <div className={`px-5 py-4 border-b ${headerBorder}`}>
          <div className={`font-serif ${titleColor}`}>Client Notes</div>
          <div className={`text-xs ${mutedColor} mt-0.5`}>Visible to everyone on staff</div>
        </div>
      )}

      {mode === 'add-only' && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className={`w-full text-left px-4 py-3 text-sm ${mutedColor} hover:${dark ? 'text-white' : 'text-charcoal-900'} transition-colors`}
        >
          + Add a note for this client
        </button>
      )}

      {(mode === 'full' || expanded) && (
        <div className={`p-5 space-y-3 ${mode === 'full' ? `border-b ${headerBorder}` : ''}`}>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className={`w-full ${inputBg} border rounded-lg px-3 py-2 text-sm outline-none focus:border-od-green resize-none`}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className={`text-xs ${mutedColor} hover:${dark ? 'text-white' : 'text-charcoal-900'} cursor-pointer transition-colors flex items-center gap-1.5`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9a2 2 0 012-2h1.5l1-1.5h5l1 1.5H16a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="10" cy="13" r="3"/></svg>
              {files.length > 0 ? `${files.length} photo${files.length > 1 ? 's' : ''} selected` : 'Add photos'}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => setFiles(Array.from(e.target.files || []))}
              />
            </label>
            <div className="flex items-center gap-2">
              {mode === 'add-only' && (
                <button
                  onClick={() => { setExpanded(false); setBody(''); setFiles([]); setError('') }}
                  className={`text-xs ${mutedColor} hover:${dark ? 'text-white' : 'text-charcoal-900'} transition-colors`}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 bg-od-green hover:bg-od-green-light text-white font-semibold rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save note'}
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {success && <p className="text-od-green text-xs">Note saved.</p>}
        </div>
      )}

      {mode === 'full' && (
        loading ? (
          <div className={`p-5 text-center ${mutedColor} text-sm`}>Loading...</div>
        ) : notes.length === 0 ? (
          <div className={`p-5 text-center ${mutedColor} text-sm`}>No notes yet.</div>
        ) : (
          <div className={`divide-y ${dark ? 'divide-charcoal-700' : 'divide-warm-200'}`}>
            {notes.map(n => (
              <div key={n.id} className="p-5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-semibold ${titleColor}`}>{n.author_name || 'Staff'}</span>
                  <span className={`text-xs ${mutedColor}`}>
                    {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                {n.body && <p className={`text-sm ${bodyColor} leading-relaxed mb-2`}>{n.body}</p>}
                {(photoUrls[n.id]?.length ?? 0) > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {photoUrls[n.id].map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt="Note attachment"
                          className={`w-16 h-16 rounded-lg object-cover border ${dark ? 'border-charcoal-700' : 'border-warm-300'}`}
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
