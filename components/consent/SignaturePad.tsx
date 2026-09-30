'use client'
import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import SignaturePadLib from 'signature_pad'

export interface SignaturePadHandle {
  toPngDataUrl: () => string | null
  clear: () => void
  isEmpty: () => boolean
}

// Smooth, pressure-like signature drawing powered by the `signature_pad`
// library (szimek/signature_pad): velocity-based bezier strokes instead of
// raw lineTo segments, plus proper devicePixelRatio scaling so signatures
// stay crisp on retina/iPhone displays.
const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePadLib | null>(null)
  const [, forceRender] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const pad = new SignaturePadLib(canvas, {
      minWidth: 1.2,
      maxWidth: 3.2,
      penColor: '#141412',
      backgroundColor: 'rgba(255,255,255,0)',
      throttle: 16,
      minDistance: 5,
    })
    padRef.current = pad

    // Scale the backing store for the device pixel ratio so strokes are
    // crisp on retina screens. Preserve any in-progress signature across
    // resizes (e.g. orientation change).
    function resizeCanvas() {
      const el = canvasRef.current
      if (!el) return
      const data = pad.toData()
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      el.width = Math.floor(el.offsetWidth * ratio)
      el.height = Math.floor(el.offsetHeight * ratio)
      const ctx = el.getContext('2d')
      if (ctx) ctx.scale(ratio, ratio)
      pad.clear()
      if (data.length > 0) pad.fromData(data)
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    pad.addEventListener('endStroke', () => forceRender(n => n + 1))

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      pad.off()
      padRef.current = null
    }
  }, [])

  function doClear() {
    padRef.current?.clear()
    forceRender(n => n + 1)
  }

  useImperativeHandle(ref, () => ({
    toPngDataUrl: () => {
      const pad = padRef.current
      if (!pad || pad.isEmpty()) return null
      return pad.toDataURL('image/png')
    },
    clear: doClear,
    isEmpty: () => padRef.current?.isEmpty() ?? true,
  }))

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full h-[150px] bg-white border border-warm-300 rounded-lg touch-none cursor-crosshair"
      />
      <button
        type="button"
        onClick={doClear}
        className="mt-1 text-xs text-charcoal-500 hover:text-charcoal-900 transition-colors"
      >
        Clear
      </button>
    </div>
  )
})

export default SignaturePad
