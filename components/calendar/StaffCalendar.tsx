'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, DateSelectArg, DatesSetArg, EventContentArg } from '@fullcalendar/core'
import { createClient } from '@/lib/supabase'
import AppointmentPopover from './AppointmentPopover'
import WalkInPopover from './WalkInPopover'
import QuickBookModal from './QuickBookModal'
import DayGlance, { type CalView } from './DayGlance'
import { AnimatePresence } from '@/components/motion'
import { tint, statusMeta, fmtTime12, fmtTimeShort, fmtPrice, toDateStr } from './calendarTheme'
import { waitingLabel, type WalkIn } from '@/lib/walkIns'

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
  /** Deep link: open this appointment's detail popover once loaded (?appt=<id>). */
  openApptOnLoad?: string
}

export default function StaffCalendar({ shopId, barberId, barberName, color, shopCode, openBookOnLoad, openApptOnLoad }: Props) {
  const [view, setView] = useState<CalView>('dayGridMonth')
  const [viewStart, setViewStart] = useState(new Date())
  const [viewRange, setViewRange] = useState<{ start: Date; end: Date } | null>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [popover, setPopover] = useState<{ appt: any; x: number; y: number } | null>(null)
  const [walkInPopover, setWalkInPopover] = useState<{ walkIn: WalkIn; x: number; y: number } | null>(null)
  const [walkIns, setWalkIns] = useState<WalkIn[]>([])
  const [soloShop, setSoloShop] = useState(false)
  const [roster, setRoster] = useState<{ barber_id: string; barber_name: string; alias?: string | null }[]>([])
  const [bookSlot, setBookSlot] = useState<{ date: string; time: string } | null>(null)
  const [showBook, setShowBook] = useState(openBookOnLoad || false)
  const calRef = useRef<FullCalendar>(null)
  const deepLinkOpened = useRef(false)
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
      const [{ data: s }, { count }, { data: r }] = await Promise.all([
        supabase.from('services').select('id, name, price').eq('shop_id', shopId).eq('active', true).order('price', { ascending: true }),
        supabase.from('shop_barbers').select('barber_id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('active', true),
        // Full active roster so the walk-in popover can name claimed barbers.
        // ("Public can view active shop barbers" RLS permits this read.)
        supabase.from('shop_barbers').select('barber_id, barber_name, alias').eq('shop_id', shopId).eq('active', true),
      ])
      setServices(s || [])
      setSoloShop((count ?? 1) <= 1)
      setRoster((r as any[]) || [])
      await loadAppointments()
    }
    init()
  }, [shopId, barberId, supabase, loadAppointments])

  // Deep link (?appt=<id>): once appointments are loaded, jump the
  // calendar to the appointment's date and open its detail popover,
  // centered on screen. Used by notification tap-through.
  useEffect(() => {
    if (!openApptOnLoad || deepLinkOpened.current || appointments.length === 0) return
    const appt = appointments.find(a => a.id === openApptOnLoad)
    if (!appt) return
    deepLinkOpened.current = true
    try { calRef.current?.getApi().gotoDate(appt.date) } catch { /* stay on current view */ }
    setPopover({
      appt,
      x: Math.max(24, Math.round(window.innerWidth / 2)),
      y: Math.max(24, Math.round(window.innerHeight / 3)),
    })
  }, [openApptOnLoad, appointments])

  useEffect(() => {
    const channel = supabase.channel('barber-cal-appts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `barber_id=eq.${barberId}` }, loadAppointments)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [barberId, supabase, loadAppointments])

  // Today's waiting walk-ins for the whole shop — this barber can take any of them.
  const loadWalkIns = useCallback(async () => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('walk_ins')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'waiting')
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: true })
    setWalkIns((data as WalkIn[]) || [])
  }, [shopId, supabase])

  useEffect(() => {
    loadWalkIns()
    const channel = supabase.channel('barber-cal-walkins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walk_ins', filter: `shop_id=eq.${shopId}` }, loadWalkIns)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [shopId, supabase, loadWalkIns])

  const fcEvents = useMemo(() => {
    const apptEvents = appointments.map(a => {
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
    })
    const walkInEvents = walkIns.map(w => {
      const start = new Date(w.created_at)
      const end = new Date(start.getTime() + 30 * 60000)
      return {
        id: `walkin-${w.id}`,
        title: `Walk-in · ${w.client_name}`,
        start: start.toISOString(),
        end: end.toISOString(),
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        textColor: 'inherit',
        extendedProps: {
          _walkIn: true,
          _walkInData: w,
        },
      }
    })
    return [...apptEvents, ...walkInEvents]
  }, [appointments, walkIns])

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault()
    const props = info.event.extendedProps
    if (props._walkIn) {
      setWalkInPopover({ walkIn: props._walkInData as WalkIn, x: info.jsEvent.clientX, y: info.jsEvent.clientY })
      return
    }
    setPopover({ appt: { ...props, id: info.event.id }, x: info.jsEvent.clientX, y: info.jsEvent.clientY })
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

  // Date navigation — resolve the FullCalendar API at click time so the ref is
  // always fresh (never a stale or undefined render-time capture).
  const goToday = useCallback(() => calRef.current?.getApi().today(), [])
  const goPrev = useCallback(() => calRef.current?.getApi().prev(), [])
  const goNext = useCallback(() => calRef.current?.getApi().next(), [])
  const gotoDate = useCallback((dateStr: string) => calRef.current?.getApi().gotoDate(dateStr), [])

  function renderEventContent(arg: EventContentArg) {
    const props = arg.event.extendedProps

    // Walk-in blocks: dashed outline, clearly not a booked appointment.
    if (props._walkIn) {
      const w = props._walkInData as WalkIn
      const firstName = (w.client_name || 'Walk-in').split(' ')[0]
      const claimedByMe = w.requested_barber_id === barberId
      if (arg.view.type === 'dayGridMonth') {
        return (
          <div className="flex items-center gap-1 px-1 py-px overflow-hidden">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 border border-dashed border-amber-600" />
            <span className="text-[10px] font-medium truncate text-amber-700">
              Walk-in {firstName}
            </span>
          </div>
        )
      }
      return (
        <div
          className="h-full w-full rounded-md px-2 py-1 overflow-hidden flex flex-col justify-center border-2 border-dashed"
          style={{
            borderColor: claimedByMe ? accent : '#d97706',
            background: claimedByMe ? tint(accent, 0.08) : 'rgba(217,119,6,0.07)',
          }}
        >
          <div className="text-[12px] font-bold truncate" style={{ color: '#92400e' }}>
            Walk-in · {firstName}
          </div>
          <div className="text-[11px] leading-tight truncate" style={{ color: '#b45309' }}>
            {waitingLabel(w.created_at)}{claimedByMe ? ' · Yours' : ''}
          </div>
        </div>
      )
    }

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

  return (
    <div className="chairos-cal flex flex-col w-full" style={{ height: 'calc(100dvh - 56px)' }}>
      <style>{FC_CSS}</style>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-warm-100 border-b border-warm-200 flex-shrink-0 flex-wrap gap-y-2">
        {/* View tabs */}
        <div className="flex gap-1 bg-warm-200 rounded-xl p-1">
          {([['timeGridDay','Day'],['timeGridWeek','Week'],['dayGridMonth','Month']] as [CalView,string][]).map(([v,label]) => (
            <button key={v} onClick={() => changeView(v)}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors min-h-[44px] ${view===v ? 'bg-warm-50 text-od-green shadow-sm' : 'text-charcoal-500 hover:text-charcoal-900'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Date nav — one grouped, thumb-friendly control cluster */}
        <div className="flex items-center gap-1 bg-warm-200 rounded-xl p-1 flex-shrink-0">
          <button onClick={goToday}
            className="px-4 py-2 rounded-lg text-[13px] font-bold bg-warm-50 text-charcoal-700 shadow-sm hover:text-od-green transition-colors min-h-[44px]">
            Today
          </button>
          <button onClick={goPrev} aria-label="Previous period"
            className="w-11 h-11 rounded-lg flex items-center justify-center text-2xl text-charcoal-600 hover:bg-warm-50 hover:text-charcoal-900 transition-colors">
            ‹
          </button>
          <label className="relative flex items-center justify-center gap-1.5 px-2 min-h-[44px] rounded-lg cursor-pointer hover:bg-warm-50 transition-colors" title="Jump to a date">
            <span className="text-[15px] font-bold text-charcoal-900 leading-tight text-center whitespace-nowrap">{getDateLabel(view, viewStart)}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-charcoal-400 flex-shrink-0" aria-hidden="true">
              <rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
            </svg>
            {/* Visually hidden but tappable native date input — opens the OS
                date picker on mobile Safari. opacity-0 (never display:none). */}
            <input
              type="date"
              value={toDateStr(viewStart)}
              onChange={(e) => { if (e.target.value) gotoDate(e.target.value); e.target.blur() }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Jump to a date"
            />
          </label>
          <button onClick={goNext} aria-label="Next period"
            className="w-11 h-11 rounded-lg flex items-center justify-center text-2xl text-charcoal-600 hover:bg-warm-50 hover:text-charcoal-900 transition-colors">
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
      <DayGlance appointments={appointments} view={view} viewRange={viewRange} walkInCount={walkIns.length} />

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

      {/* Walk-in popover */}
      <AnimatePresence>
        {walkInPopover && (
          <WalkInPopover
            walkIn={walkInPopover.walkIn}
            shopId={shopId}
            barbers={roster.length > 0 ? roster : [{ barber_id: barberId, barber_name: barberName }]}
            services={services}
            isOwner={false}
            actingBarberId={barberId}
            solo={soloShop}
            x={walkInPopover.x}
            y={walkInPopover.y}
            onClose={() => setWalkInPopover(null)}
            onChanged={loadWalkIns}
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
