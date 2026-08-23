'use client'
import { useRef, useState, useImperativeHandle, forwardRef } from 'react'

export interface SignaturePadHandle {
  toPngDataUrl: () => string | null
  clear: () => void
  isEmpty: () => boolean
}

// Plain canvas pointer-drawing pad — no signature library needed for
// something this simple, keeps the dependency footprint down.
const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasDrawn = useRef(false)
  const [, forceRender] = useState(0)

  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    drawing.current = true
    canvas.setPointerCapture(e.pointerId)
    const ctx = canvas.getContext('2d')!
    const { x, y } = getCanvasPoint(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const { x, y } = getCanvasPoint(e)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#141412'
    ctx.lineTo(x, y)
    ctx.stroke()
    hasDrawn.current = true
  }

  function handlePointerUp() {
    drawing.current = false
    forceRender(n => n + 1)
  }

  useImperativeHandle(ref, () => ({
    toPngDataUrl: () => (hasDrawn.current ? canvasRef.current?.toDataURL('image/png') ?? null : null),
    clear: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
      hasDrawn.current = false
      forceRender(n => n + 1)
    },
    isEmpty: () => !hasDrawn.current,
  }))

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={500}
        height={150}
        className="w-full bg-white border border-warm-300 rounded-lg touch-none cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <button
        type="button"
        onClick={() => {
          const canvas = canvasRef.current
          if (!canvas) return
          canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
          hasDrawn.current = false
          forceRender(n => n + 1)
        }}
        className="mt-1 text-xs text-charcoal-500 hover:text-charcoal-900 transition-colors"
      >
        Clear
      </button>
    </div>
  )
})

export default SignaturePad
