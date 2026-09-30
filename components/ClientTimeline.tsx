'use client'
import { VerticalTimeline, VerticalTimelineElement } from 'react-vertical-timeline-component'
import 'react-vertical-timeline-component/style.min.css'

export type TimelineAppointment = {
  id: string
  date: string
  time: string | null
  price: number
  status: string
  barber_id: string
  services: { name: string } | null
}

/**
 * Premium full client timeline (open-source: react-vertical-timeline).
 * Every visit, no-show, and cancellation on one scroll — the owner's
 * memory of the client, visible at a glance.
 */
export default function ClientTimeline({
  appointments,
  barberName,
}: {
  appointments: TimelineAppointment[]
  barberName: (barberId: string) => string
}) {
  if (appointments.length === 0) {
    return <div className="p-8 text-center text-charcoal-500 text-sm">No appointment history found.</div>
  }

  const dot: Record<string, string> = {
    done: '#3d7a3d',
    noshow: '#c0392b',
    cancelled: '#9a9184',
    pending: '#b8861f',
    confirmed: '#2b2620',
  }

  const label: Record<string, string> = {
    done: 'Completed',
    noshow: 'No-show',
    cancelled: 'Cancelled',
    pending: 'Pending',
    confirmed: 'Confirmed',
  }

  return (
    <VerticalTimeline layout="1-column-left" animate={false}>
      {appointments.map(a => {
        const color = dot[a.status] || '#9a9184'
        return (
          <VerticalTimelineElement
            key={a.id}
            date={new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            icon={<span style={{ display: 'block', width: 12, height: 12, borderRadius: '50%', background: color }} />}
            iconStyle={{ background: '#faf7f2', border: `3px solid ${color}`, boxShadow: 'none' }}
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #e8e0d4',
              borderRadius: '12px',
              boxShadow: 'none',
              padding: '14px 18px',
            }}
            contentArrowStyle={{ borderRight: '7px solid #e8e0d4' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-charcoal-900">
                  {(a.services as any)?.name || 'Service'}
                </div>
                <div className="text-xs text-charcoal-500 mt-0.5">
                  {barberName(a.barber_id)}
                  {a.time ? ` · ${a.time}` : ''}
                  {' · '}
                  <span style={{ color }}>{label[a.status] || a.status}</span>
                </div>
              </div>
              {a.status === 'done' && (
                <div className="font-mono text-sm font-semibold text-charcoal-900">
                  ${parseFloat(String(a.price)).toFixed(2)}
                </div>
              )}
            </div>
          </VerticalTimelineElement>
        )
      })}
    </VerticalTimeline>
  )
}
