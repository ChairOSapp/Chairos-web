'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

type StatusData = { status: string; position: number; shopName: string }

export default function KioskStatus() {
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<StatusData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function poll() {
      const res = await fetch(`/api/kiosk/status/${id}`)
      if (!res.ok) { setNotFound(true); return }
      const json = await res.json()
      setData(json)
      if (json.status === 'done' || json.status === 'cancelled') {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }
    poll()
    intervalRef.current = setInterval(poll, 15000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [id])

  if (notFound) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <p className="text-charcoal-500 text-sm">Check-in not found.</p>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  const message =
    data.status === 'waiting' ? (data.position === 0 ? "You're up next!" : `You're #${data.position + 1} in line`) :
    data.status === 'called' ? "You're up next!" :
    data.status === 'in_service' ? 'Enjoy your visit!' :
    data.status === 'done' ? 'Thanks for stopping by!' :
    'This check-in was cancelled.'

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif text-2xl text-od-green mb-1">{data.shopName}</h1>
        <div className="bg-warm-100 border border-warm-200 rounded-xl p-8 mt-6">
          <p className="font-serif text-xl text-charcoal-900">{message}</p>
          {data.status === 'waiting' && (
            <p className="text-charcoal-400 text-sm mt-2">We'll be ready for you shortly.</p>
          )}
        </div>
      </div>
    </div>
  )
}
