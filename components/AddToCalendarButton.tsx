'use client'
import { useEffect, useRef } from 'react'

/**
 * "Add to calendar" on the booking confirmation (open-source:
 * add-to-calendar-button). The appointment lands in the client's real
 * calendar and their phone nags them instead of the shop — the cheapest
 * no-show reduction available. Rendered as a web component via dynamic
 * import so SSR never touches customElements.
 */
export default function AddToCalendarButton({
  name,
  startDate,
  startTime,
  endTime,
  timeZone,
  location,
  description,
}: {
  name: string
  /** YYYY-MM-DD */
  startDate: string
  /** HH:MM 24h */
  startTime: string
  /** HH:MM 24h */
  endTime: string
  timeZone: string
  location?: string
  description?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    import('add-to-calendar-button').then(() => {
      if (cancelled || !hostRef.current) return
      hostRef.current.innerHTML = ''
      const el = document.createElement('add-to-calendar-button')
      el.setAttribute('name', name)
      el.setAttribute('startDate', startDate)
      el.setAttribute('startTime', startTime)
      el.setAttribute('endTime', endTime)
      el.setAttribute('timeZone', timeZone)
      if (location) el.setAttribute('location', location)
      if (description) el.setAttribute('description', description)
      el.setAttribute('options', "'Apple','Google','Outlook.com'")
      el.setAttribute('label', 'Add to calendar')
      el.setAttribute('trigger', 'click')
      hostRef.current.appendChild(el)
    })
    return () => {
      cancelled = true
      if (hostRef.current) hostRef.current.innerHTML = ''
    }
  }, [name, startDate, startTime, endTime, timeZone, location, description])

  return <div ref={hostRef} className="flex justify-center" />
}
