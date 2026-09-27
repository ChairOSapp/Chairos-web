'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, DateSelectArg, DatesSetArg, EventContentArg } from '@fullcalendar/core'
import { createClient } from '@/lib/supabase'
import AppointmentPopover from './AppointmentPopover'
import QuickBookModal from './QuickBookModal'
import DayGlance, { type CalView } from './DayGlance'
import { AnimatePresence } from '@/components/motion'
import { tint, statusMeta, fmtTime12, fmtTimeShort, fmtPrice, toDateStr } from './calendarTheme'

function addMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}:00`
}

function getDateLabel(view: CalView, d: Date): string {
  if (view === 'timeGridDay') return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  if (view === 'timeGridWeek') {
    const end = new Date(d); end.setDate(d.getDate() + 6)
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const FC_CSS = `
.chairos-cal .fc-timegrid-now-indicator-line { border-color: #dc2626; border-top-width: 2px; }
.chairos-cal .fc-timegrid-now-indicator-arrow { border-top-color: #dc2626; border-bottom-color: #dc2626; }
.chairos-cal .fc-day-today { background: ${tint('#4B5320', 0.05)} !important; }
.chairos-cal .fc-col-header-cell.fc-day-today .fc-col-header-cell-cushion { color: #4B5320; font-weight: 800; }
.chairos-cal .fc-timegrid-slot { height: 40px; }
.chairos-cal .fc-event { box-shadow: none; background: transparent; border: none; }
.chairos-cal .fc-daygrid-event { background: transparent; border: none; }
.chairos-cal .fc-v-event .fc-event-main { padding: 0; }
`

interface Props {
  shopId: string
  barberId: string
  barberName: string
  /** The barber's own staff color (falls back to brand olive). */
  color?: string
  shopCode?: string
  openBookOnLoad?: boolean
}

export default function StaffCalendar({ shopId, barberId, barberName, color, shopCode, openBookOnLoad }: Props) {
  const [view, setView] = useState<CalView>('dayGridMonth')
  const [viewStart, setViewStart] = useState(new Date())
  const [viewRange, setViewRange] = useState<{ start: Date; end: Date } | null>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [popover, setPopover] = useState<{ appt: any; x: number; y: number } | null>(null)
  const [bookSlot, setBookSlot] = useState<{ date: string; time: string } | null>(null)
  const [showBook, setShowBook] = useState(openBookOnLoad || false)
  const calRef = useRef<FullCalendar>(null)
  const supabase = useMemo(() => createClient(), [])
  const accent = color || '#4B5320'

  const loadAppointments = useCallback(async () => {
    const now = new Date()
    const past = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const future = new Date(now.getFullYear(), now.getMonth() + 4, 0)
    const { data } = await supabase
      .from('appointments')
      .select('*, services(name, price)')
      .eq('barber_id', barberId)
      .gte('date', toDateStr(past))
      .lte('date', toDateStr(future))
      .order('date').order('time', { ascending: true })
    setAppointments(data || [])
  }, [barberId, supabase])

  useEffect(() => {
    async function init() {
      const { data: s } = await supabase.from('services').select('id, name, price').eq('shop_id', shopId).eq('active', true).order('price', { ascending: true })
      setServices(s || [])
      await loadAppointments()
    }
    init()
  }, [shopId, barberId, supabase, loadAppointments])

  useEffect(() => {
    const channel = supabase.channel('barber-cal-appts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `barber_id=eq.${barberId}` }, loadAppointments)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [barberId, supabase, loadAppointments])

  const fcEvents = useMemo(() => appointments.map(a => {
    const timeStr = a.time || '09:00:00'
    return {
      id: a.id,
      title: a.client_name || 'Walk-in',
      start: `${a.date}T${timeStr}`,
      end: `${a.date}T${addMins(timeStr, 30)}`,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      textColor: 'inherit',
      extendedProps: {
        ...a,
        serviceName: a.services?.name || '',
      },
    }
  }), [appointments])

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault()
    setPopover({ appt: { ...info.event.extendedProps, id: info.event.id }, x: info.jsEvent.clientX, y: info.jsEvent.clientY })
  }

  function handleSelect(info: DateSelectArg) {
    const dateStr = info.startStr.split('T')[0]
    const timeStr = info.startStr.includes('T') ? info.startStr.split('T')[1].slice(0,8) : '09:00:00'
    setBookSlot({ date: dateStr, time: timeStr })
    setShowBook(true)
    calRef.current?.getApi().unselect()
  }

  function handleDatesSet(info: DatesSetArg) {
    setViewStart(info.start)
    setViewRange({ start: info.start, end: info.end })
  }

  function changeView(v: CalView) {
    setView(v)
    calRef.current?.getApi().changeView(v)
  }

  function renderEventContent(arg: EventContentArg) {
    const props = arg.event.extendedProps
    const meta = statusMeta(props.status)
    const name = arg.event.title || 'Walk-in'
    const parts = name.split(' ')
    const shortName = parts[0] + (parts[1] ? ` ${parts[1][0]}.` : '')

    if (arg.view.type === 'dayGridMonth') {
      return (
        <div className="flex items-center gap-1 px-1 py-px overflow-hidden">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent }} />
          <span
            className="text-[10px] font-medium truncate"
            style={{
              color: 'var(--color-text-primary)',
              opacity: meta.dimmed ? 0.6 : meta.strike ? 0.45 : 1,
              textDecoration: meta.strike ? 'line-through' : 'none',
            }}
          >
            {fmtTimeShort(props.time)} {parts[0]}
          </span>
        </div>
      )
    }

    return (
      <div
        className="h-full w-full rounded-md px-2 py-1 overflow-hidden flex flex-col justify-center gap-0.5"
        style={{
          background: tint(accent, 0.13),
          borderLeft: `3px solid ${accent}`,
          opacity: meta.dimmed ? 0.62 : meta.strike ? 0.45 : 1,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.dot }} />
          <span
            className="text-[12px] font-bold truncate"
            style={{ color: 'var(--color-text-primary)', textDecoration: meta.strike ? 'line-through' : 'none' }}
          >
            {meta.dimmed ? '✓ ' : ''}{shortName}
          </span>
          <span className="ml-auto text-[11px] font-semibold flex-shrink-0 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
            {fmtPrice(props.price)}
          </span>
        </div>
        {props.serviceName && (
          <div className="text-[11px] leading-tight truncate pl-3" style={{ color: 'var(--color-text-secondary)' }}>
            {props.serviceName} · {fmtTime12(props.time)}
          </div>
        )}
      </div>
    )
  }

  const api = calRef.current?.getApi()

  return (
    <div className="chairos-cal flex flex-col w-full" style={{ height: 'calc(100vh - 56px)' }}>
      <style>{FC_CSS}</style>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-warm-100 border-b border-warm-200 flex-shrink-0 flex-wrap gap-y-2">
        {/* View tabs */}
        <div className="flex gap-1 bg-warm-200 rounded-xl p-1">
          {([['timeGridDay','Day'],['timeGridWeek','Week'],['dayGridMonth','Month']] as [CalView,string][]).map(([v,label]) => (
            <button key={v} onClick={() => changeView(v)}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors min-h-[40px] ${view===v ? 'bg-warm-50 text-od-green shadow-sm' : 'text-charcoal-500 hover:text-charcoal-900'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-1">
          <button onClick={() => api?.today()}
            className="px-3 py-2 rounded-xl text-[13px] font-semibold bg-warm-200 text-charcoal-600 hover:bg-warm-300 transition-colors min-h-[40px]">
            Today
          </button>
          <button onClick={() => api?.prev()} aria-label="Previous"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl text-charcoal-500 hover:bg-warm-200 hover:text-charcoal-900 transition-colors">
            ‹
          </button>
          <div className="min-w-[150px] text-center px-1">
            <div className="text-[15px] font-bold text-charcoal-900 leading-tight">{getDateLabel(view, viewStart)}</div>
          </div>
          <button onClick={() => api?.next()} aria-label="Next"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl text-charcoal-500 hover:bg-warm-200 hover:text-charcoal-900 transition-colors">
            ›
          </button>
        </div>

        {/* Book */}
        <button
          onClick={() => { setBookSlot(null); setShowBook(true) }}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-od-green hover:opacity-90 text-white text-[13px] font-bold rounded-xl transition-opacity min-h-[44px]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 4v16m8-8H4"/></svg>
          Book client
        </button>
      </div>

      {/* Day at a glance */}
      <DayGlance appointments={appointments} view={view} viewRange={viewRange} />

      {/* Calendar */}
      <div className="flex-1 overflow-auto bg-warm-50">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          height="100%"
          expandRows={true}
          stickyHeaderDates={true}
          fixedWeekCount={false}
          events={fcEvents}
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          slotDuration="00:15:00"
          slotLabelInterval="01:00:00"
          nowIndicator={true}
          selectable={true}
          selectMirror={true}
          select={handleSelect}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          datesSet={handleDatesSet}
          eventMinHeight={36}
          dayMaxEventRows={4}
          dateClick={(info) => {
            if (view === 'dayGridMonth') {
              calRef.current?.getApi().gotoDate(info.date)
              changeView('timeGridDay')
            }
          }}
        />
      </div>

      <AnimatePresence>
        {popover && (
          <AppointmentPopover
            appointment={popover.appt}
            barberName={barberName}
            accentColor={accent}
            x={popover.x}
            y={popover.y}
            isOwner={false}
            onClose={() => setPopover(null)}
            onUpdated={loadAppointments}
          />
        )}
      </AnimatePresence>

      {showBook && (
        <QuickBookModal
          shopId={shopId}
          initialDate={bookSlot?.date}
          initialTime={bookSlot?.time}
          initialBarberId={barberId}
          lockedBarberId={barberId}
          barbers={[{ barber_id: barberId, barber_name: barberName }]}
          services={services}
          onCreated={loadAppointments}
          onClose={() => { setShowBook(false); setBookSlot(null) }}
        />
      )}
    </div>
  )
}
