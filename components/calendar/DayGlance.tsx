'use client'
import { useMemo } from 'react'
import { fmtTime12, fmtDateLabel, toDateStr, timeToMin, fmtPrice } from './calendarTheme'

export type CalView = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth'

export interface GlanceAppt {
  id: string
  date: string
  time: string
  price: number | string
  status: string
  client_name: string
  barber_id?: string
  /** appointment-level duration override, when set */
  duration_minutes?: number | null
  services?: { duration_minutes?: number | null } | null
}

interface Props {
  appointments: GlanceAppt[]
  view: CalView
  viewRange: { start: Date; end: Date } | null
  /** Resolve a barber id to a display name (owner view). Omit for single-staff view. */
  barberNameFor?: (barberId?: string) => string
  /** Today's waiting walk-ins — shown as a pill in the day view. */
  walkInCount?: number
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warn' | 'live' }) {
  const cls =
    tone === 'live'
      ? 'bg-red-50 text-red-600 border-red-200'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-warm-200 text-charcoal-600 border-warm-300'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap ${cls}`}>
      {children}
    </span>
  )
}

const LiveDot = () => <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />

/**
 * Slim "read your day at a glance" strip: who's in the chair, what's next,
 * what needs attention, and what's on the books. Day + week views only.
 */
export default function DayGlance({ appointments, view, viewRange, barberNameFor, walkInCount }: Props) {
  const glance = useMemo(() => {
    if (!viewRange || view === 'dayGridMonth') return null
    const live = appointments.filter(a => a.status !== 'cancelled' && a.status !== 'noshow')

    if (view === 'timeGridDay') {
      const dayStr = toDateStr(viewRange.start)
      const todays = live.filter(a => a.date === dayStr)
      const isToday = dayStr === toDateStr(new Date())
      const nowMin = timeToMin(`${new Date().getHours()}:${new Date().getMinutes()}:00`)
      const inChair = isToday
        ? todays.filter(a => {
            const s = timeToMin(a.time)
            // The service's actual duration: appointment override first,
            // then the service's set length, 30 min when neither is set.
            const dur = a.duration_minutes ?? a.services?.duration_minutes ?? 30
            return s <= nowMin && nowMin < s + dur
          })
        : []
      const upcoming = isToday
        ? todays
            .filter(a => timeToMin(a.time) > nowMin && (a.status === 'pending' || a.status === 'confirmed'))
            .sort((x, y) => timeToMin(x.time) - timeToMin(y.time))
        : []
      const unconfirmed = todays.filter(a => a.status === 'pending').length
      const booked = todays.reduce((s, a) => s + (parseFloat(String(a.price)) || 0), 0)
      return { kind: 'day' as const, dayStr, isToday, inChair, upcoming, unconfirmed, count: todays.length, booked }
    }

    const s = toDateStr(viewRange.start)
    const e = toDateStr(viewRange.end)
    const weeks = live.filter(a => a.date >= s && a.date < e)
    const booked = weeks.reduce((sum, a) => sum + (parseFloat(String(a.price)) || 0), 0)
    return { kind: 'week' as const, count: weeks.length, booked }
  }, [appointments, view, viewRange])

  if (!glance) return null

  const who = (a: GlanceAppt) => {
    const name = (a.client_name || 'Walk-in').split(' ')[0]
    const b = barberNameFor?.(a.barber_id)
    return b ? `${name} (with ${b.split(' ')[0]})` : name
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-warm-100 border-b border-warm-200 overflow-x-auto flex-shrink-0">
      {glance.kind === 'day' ? (
        <>
          <span className="text-[13px] font-bold text-charcoal-900 whitespace-nowrap">
            {glance.isToday ? 'Today' : fmtDateLabel(glance.dayStr)}
          </span>
          {glance.count === 0 ? (
            <span className="text-xs text-charcoal-500 whitespace-nowrap">
              Nothing on the books yet — tap any open time to add one.
            </span>
          ) : (
            <>
              {glance.inChair.length > 0 && (
                <Pill tone="live">
                  <LiveDot />
                  In the chair: {glance.inChair.map(who).join(', ')}
                </Pill>
              )}
              {glance.upcoming.length > 0 && (
                <Pill>
                  Up next: {who(glance.upcoming[0])} · {fmtTime12(glance.upcoming[0].time)}
                </Pill>
              )}
              {glance.upcoming.length > 1 && (
                <Pill>{glance.upcoming.length - 1} more after that</Pill>
              )}
              {!glance.isToday && <Pill>{glance.count} booked</Pill>}
              {glance.unconfirmed > 0 && (
                <Pill tone="warn">{glance.unconfirmed} waiting to confirm</Pill>
              )}
              {glance.isToday && (walkInCount || 0) > 0 && (
                <Pill tone="warn">{walkInCount} walk-in{(walkInCount || 0) === 1 ? '' : 's'} waiting</Pill>
              )}
              <Pill>{fmtPrice(glance.booked)} on the books</Pill>
            </>
          )}
        </>
      ) : (
        <>
          <span className="text-[13px] font-bold text-charcoal-900 whitespace-nowrap">This week</span>
          {glance.count === 0 ? (
            <span className="text-xs text-charcoal-500 whitespace-nowrap">Nothing booked yet.</span>
          ) : (
            <>
              <Pill>{glance.count} appointment{glance.count === 1 ? '' : 's'}</Pill>
              <Pill>{fmtPrice(glance.booked)} on the books</Pill>
            </>
          )}
        </>
      )}
    </div>
  )
}
