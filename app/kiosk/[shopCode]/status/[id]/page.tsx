'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type StatusData = { status: string; position: number; shopName: string }

const RETURN_TO_KIOSK_MS = 10000

export default function KioskStatus() {
  const params = useParams()
  const router = useRouter()
  const shopCode = (params.shopCode as string)?.toUpperCase()
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

  // This is a shared tablet, not the walk-in's own phone -- it needs to
  // free up for the next person rather than sit on one customer's queue
  // position indefinitely.
  useEffect(() => {
    const timer = setTimeout(() => router.push(`/kiosk/${shopCode}`), RETURN_TO_KIOSK_MS)
    return () => clearTimeout(timer)
  }, [router, shopCode])

  if (notFound) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-8">
      <p className="text-charcoal-500 text-xl">We couldn't find that check-in. Ask us at the counter.</p>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-od-green border-t-transparent animate-spin" />
    </div>
  )

  const message =
    data.status === 'waiting' ? (data.position === 0 ? "You're up next!" : `You're #${data.position + 1} in line`) :
    data.status === 'called' ? "You're up next!" :
    data.status === 'in_service' ? 'Enjoy your visit!' :
    data.status === 'done' ? 'Thanks for stopping by!' :
    'This check-in was cancelled.'

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl text-center">
        <h1 className="font-serif text-4xl text-od-green mb-2">{data.shopName}</h1>
        <div className="bg-warm-100 border border-warm-200 rounded-2xl p-10 md:p-14 mt-8">
          <p className="font-serif text-4xl text-charcoal-900">{message}</p>
          {data.status === 'waiting' && (
            <p className="text-charcoal-500 text-xl mt-4">We'll be ready for you shortly.</p>
          )}
          <button type="button" onClick={() => router.push(`/kiosk/${shopCode}`)}
            className="w-full mt-10 bg-od-green text-white font-bold rounded-xl text-2xl min-h-[76px] transition-transform active:scale-[0.98]">
            Done
          </button>
          <p className="text-charcoal-400 text-lg mt-5">Have a seat — this screen clears itself for the next person.</p>
        </div>
      </div>
    </div>
  )
}
