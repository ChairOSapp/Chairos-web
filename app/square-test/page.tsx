'use client'

import { useEffect, useRef, useState } from 'react'
import { payments } from '@square/web-sdk'

type LogLine = { t: string; msg: string }

const SHOP_CODE = 'E97A-3885'
const CSS_URL = 'https://web.squarecdn.com/1.85.0/card-wrapper.css'

export default function SquareTestPage() {
  const [lines, setLines] = useState<LogLine[]>([])
  const [done, setDone] = useState(false)
  const logRef = useRef<LogLine[]>([])

  const log = (msg: string) => {
    const t = new Date().toISOString().slice(11, 23)
    logRef.current = [...logRef.current, { t, msg }]
    setLines(logRef.current)
  }

  useEffect(() => {
    // Sniff postMessage traffic to/from Square frames from the very start.
    const onMsg = (ev: MessageEvent) => {
      const o = String(ev.origin || '')
      if (!o.includes('squarecdn') && !o.includes('squareup')) return
      let d = ''
      try { d = JSON.stringify(ev.data).slice(0, 300) } catch { d = String(ev.data).slice(0, 300) }
      log(`[msg ${o}] ${d}`)
    }
    window.addEventListener('message', onMsg)

    const run = async () => {
      try {
        // Step 0: can the card stylesheet load at all?
        log(`STEP css-load: fetching ${CSS_URL}`)
        await new Promise<void>((resolve, reject) => {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = CSS_URL
          link.onload = () => resolve()
          link.onerror = () => reject(new Error('stylesheet onerror fired (blocked or network failure)'))
          document.head.appendChild(link)
          setTimeout(() => reject(new Error('stylesheet load timed out after 10s')), 10000)
        })
        log('STEP css-load: OK — stylesheet loaded')

        // Step 1: widget config
        log('STEP config-fetch: requesting widget config')
        const res = await fetch(`/api/square/widget-config?shopCode=${SHOP_CODE}`)
        const cfg = await res.json()
        const appId = cfg.appId ?? cfg.applicationId
        log(`STEP config-fetch: status=${res.status} appId=${String(appId).slice(0, 12)}... locationId=${cfg.locationId}`)
        if (!appId || !cfg.locationId) throw new Error('missing appId/locationId in config')

        // Step 2: SDK import (static import already done at top)
        log('STEP sdk-import: @square/web-sdk imported')

        // Step 3: payments init
        log('STEP payments-init: calling payments()')
        const p = await payments(appId, cfg.locationId)
        if (!p) throw new Error('payments() returned null')
        log('STEP payments-init: OK')

        // Step 4: card create — MINIMAL config, no custom styles
        log('STEP card-create: calling card() with NO custom styles')
        const card = await p.card()
        log('STEP card-create: OK')

        // Step 5: attach
        log('STEP card-attach: calling attach()')
        await card.attach('#square-test-container')
        log('STEP card-attach: OK — CARD FORM RENDERED (minimal)')

        // Step 6: destroy, then bisect each style key from the POS config
        // individually. Each attempt gets its own try/catch so one failing
        // key doesn't stop the rest.
        log('STEP style-bisect: destroying minimal card, testing each style key alone')
        try { await card.destroy() } catch { /* ignore */ }
        const candidates: Array<[string, any]> = [
          ['input:full', { input: { backgroundColor: 'transparent', color: '#F5F5F4', fontFamily: 'inherit', fontSize: '16px', lineHeight: '24px' } }],
          ['input:backgroundColor', { input: { backgroundColor: 'transparent' } }],
          ['input:color', { input: { color: '#F5F5F4' } }],
          ['input:fontFamily-inherit', { input: { fontFamily: 'inherit' } }],
          ['input:fontSize', { input: { fontSize: '16px' } }],
          ['input:lineHeight', { input: { lineHeight: '24px' } }],
          ['input::placeholder', { 'input::placeholder': { color: '#A8A29E' } }],
          ['input.is-error', { 'input.is-error': { color: '#FCA5A5' } }],
          ['.message-text', { '.message-text': { color: '#FCA5A5' } }],
        ]
        for (const [name, style] of candidates) {
          try {
            const c = await p.card({ style } as any)
            await c.attach('#square-test-container')
            log(`STEP style-bisect: [${name}] OK — rendered`)
            try { await c.destroy() } catch { /* ignore */ }
          } catch (e: any) {
            log(`STEP style-bisect: [${name}] FAILED name=${e?.name} message=${e?.message}`)
          }
        }
        log('STEP style-bisect: done')
      } catch (e: any) {
        log(`FAILED: step reached, error name=${e?.name} message=${e?.message}`)
      } finally {
        setDone(true)
      }
    }

    run()
    return () => window.removeEventListener('message', onMsg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ padding: 16, fontFamily: 'monospace', background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18 }}>Square card diagnostics (minimal config)</h1>
      <p style={{ color: '#999' }}>Shop: {SHOP_CODE} · no custom styles · {done ? 'finished' : 'running…'}</p>
      <div
        id="square-test-container"
        style={{ minHeight: 80, border: '1px dashed #555', borderRadius: 8, margin: '12px 0', padding: 8 }}
      />
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ borderBottom: '1px solid #222', padding: '4px 0' }}>
            <span style={{ color: '#888' }}>{l.t}</span> {l.msg}
          </div>
        ))}
      </div>
      {done && <p style={{ color: '#999' }}>Screenshot this whole page and send it.</p>}
    </div>
  )
}
