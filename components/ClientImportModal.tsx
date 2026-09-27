'use client'
import React, { useMemo, useState } from 'react'

type Field = 'ignore' | 'first_name' | 'last_name' | 'name' | 'phone' | 'email' | 'notes'

const FIELD_LABELS: Record<Field, string> = {
  ignore: 'Ignore this column',
  first_name: 'First name',
  last_name: 'Last name',
  name: 'Full name',
  phone: 'Phone',
  email: 'Email',
  notes: 'Notes',
}

/** Minimal CSV parser: handles quoted fields, escaped quotes, CRLF. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip, handled by \n */ }
    else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(v => v.trim() !== ''))
}

function autoDetect(header: string): Field {
  const h = header.toLowerCase().trim()
  if (/(first|fname|given)/.test(h)) return 'first_name'
  if (/(last|lname|sur|family)/.test(h)) return 'last_name'
  if (/(full.?name|^name|customer|client)/.test(h)) return 'name'
  if (/(phone|mobile|cell|tel)/.test(h)) return 'phone'
  if (/(email|e-mail)/.test(h)) return 'email'
  if (/(note|comment|memo)/.test(h)) return 'notes'
  return 'ignore'
}

interface Props {
  shopId: string
  onClose: () => void
  onDone: () => void
}

export default function ClientImportModal({ shopId, onClose, onDone }: Props) {
  const [step, setStep] = useState<'file' | 'map' | 'preview' | 'done'>('file')
  const [filename, setFilename] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Field[]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<any>(null)
  const [result, setResult] = useState<any>(null)

  function handleFile(f: File) {
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const rows = parseCSV(String(reader.result || ''))
        if (!rows.length) { setError('That file looks empty.'); return }
        setFilename(f.name)
        // If the first row looks like headers (no digits in most cells), treat as header
        const firstRow = rows[0]
        const looksLikeHeader = firstRow.filter(c => /[a-zA-Z]/.test(c) && !/\d{5,}/.test(c)).length >= Math.ceil(firstRow.length / 2)
        setHasHeader(looksLikeHeader)
        const hdrs = looksLikeHeader ? firstRow : firstRow.map((_, i) => `Column ${i + 1}`)
        const data = looksLikeHeader ? rows.slice(1) : rows
        setHeaders(hdrs)
        setDataRows(data.slice(0, 5000))
        setMapping(hdrs.map(autoDetect))
        setStep('map')
      } catch {
        setError('Could not read that file. Make sure it is a CSV export.')
      }
    }
    reader.readAsText(f)
  }

  const mappedRows = useMemo(() => {
    return dataRows.map(cols => {
      const get = (f: Field) => {
        const idx = mapping.findIndex(m => m === f)
        return idx >= 0 ? (cols[idx] || '').trim() : ''
      }
      const first = get('first_name')
      const last = get('last_name')
      const name = get('name') || [first, last].filter(Boolean).join(' ')
      return { name, phone: get('phone'), email: get('email'), notes: get('notes') }
    }).filter(r => r.name || r.phone || r.email)
  }, [dataRows, mapping])

  const mappedFieldCount = useMemo(() => mapping.filter(m => m !== 'ignore').length, [mapping])
  const hasNameOrContact = useMemo(
    () => mapping.some(m => m === 'name' || m === 'first_name') && mapping.some(m => m === 'phone' || m === 'email') ||
          mapping.some(m => m === 'name' || m === 'first_name' || m === 'phone' || m === 'email'),
    [mapping]
  )

  async function runImport(dryRun: boolean) {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId, rows: mappedRows, dryRun, filename }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Import failed')
      if (dryRun) { setPreview(json); setStep('preview') }
      else { setResult(json); setStep('done'); onDone() }
    } catch (e: any) {
      setError(e.message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 sm:p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-serif text-xl text-charcoal-900">Import clients</h2>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-900 text-2xl leading-none px-2" aria-label="Close">×</button>
        </div>
        <p className="text-xs text-charcoal-500 mb-5">
          Bring your client list from Booksy, Vagaro, Fresha, Square, or any app that exports CSV.
        </p>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {step === 'file' && (
          <label className="block border-2 border-dashed border-warm-300 rounded-xl p-8 text-center cursor-pointer hover:border-od-green transition-colors">
            <div className="text-3xl mb-2">📄</div>
            <div className="text-sm font-semibold text-charcoal-900">Choose a CSV file</div>
            <div className="text-xs text-charcoal-500 mt-1">Up to 5,000 rows. Nothing is imported until you confirm.</div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </label>
        )}

        {step === 'map' && (
          <>
            <div className="text-sm text-charcoal-700 mb-1">
              <span className="font-semibold">{filename}</span> — {dataRows.length} rows found
            </div>
            <div className="text-xs text-charcoal-500 mb-4">Tell us what each column holds. Columns set to “Ignore” are skipped.</div>
            <div className="space-y-2 mb-5">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-charcoal-900 truncate">{hasHeader ? h : `Column ${i + 1}`}</div>
                    <div className="text-xs text-charcoal-400 truncate">{dataRows[0]?.[i] || '—'}</div>
                  </div>
                  <select
                    value={mapping[i]}
                    onChange={e => setMapping(m => m.map((v, j) => (j === i ? (e.target.value as Field) : v)))}
                    className="text-sm border border-warm-300 rounded-lg px-2 py-1.5 bg-white text-charcoal-900"
                  >
                    {(Object.keys(FIELD_LABELS) as Field[]).map(f => (
                      <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep('file')} className="btn-chairos-outline flex-1">Back</button>
              <button
                onClick={() => runImport(true)}
                disabled={busy || mappedRows.length === 0 || !hasNameOrContact}
                className="btn-chairos flex-1 disabled:opacity-50"
              >
                {busy ? 'Checking…' : `Preview (${mappedRows.length} usable rows)`}
              </button>
            </div>
            {!hasNameOrContact && (
              <div className="text-xs text-amber-700 mt-2">Map at least a name, phone, or email column to continue.</div>
            )}
          </>
        )}

        {step === 'preview' && preview && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-warm-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-od-green">{preview.imported}</div>
                <div className="text-xs text-charcoal-500">New clients</div>
              </div>
              <div className="bg-warm-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-charcoal-700">{preview.duplicates}</div>
                <div className="text-xs text-charcoal-500">Already in your list</div>
              </div>
              <div className="bg-warm-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-charcoal-400">{preview.skipped_empty}</div>
                <div className="text-xs text-charcoal-500">Empty rows skipped</div>
              </div>
            </div>
            <p className="text-xs text-charcoal-500 mb-5">
              Duplicates are matched by phone or email and linked to your shop — nothing gets overwritten.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setStep('map')} className="btn-chairos-outline flex-1">Back</button>
              <button onClick={() => runImport(false)} disabled={busy} className="btn-chairos flex-1 disabled:opacity-50">
                {busy ? 'Importing…' : `Import ${preview.imported} clients`}
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div className="text-center py-4">
              <div className="text-4xl mb-2">✅</div>
              <div className="font-serif text-lg text-charcoal-900 mb-1">{result.imported} clients imported</div>
              <div className="text-sm text-charcoal-500">
                {result.duplicates} {result.duplicates === 1 ? 'was' : 'were'} already in your list
                {result.errors > 0 && ` · ${result.errors} rows had errors`}
              </div>
            </div>
            <button onClick={onClose} className="btn-chairos w-full">Done</button>
          </>
        )}
      </div>
    </div>
  )
}
