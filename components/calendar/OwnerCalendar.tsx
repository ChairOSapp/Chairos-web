'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, DateSelectArg, DatesSetArg, EventContentArg } from '@fullcalendar/core'
import { createClient } from '@/lib/supabase'
import AppointmentPopover from './AppointmentPopover'
import QuickBookModal from './QuickBookModal'

const BARBER_COLORS = ['#0d9488','#0369a1','#7c3aed','#b45309','#be123c','#15803d','#c2410c','#1d4ed8']

type CalView = 'resourceTimeGridDay' | 'timeGridWeek' | 'dayGridMonth'

function addMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}:00`
}

function getDateLabel(view: CalView, d: Date): string {
  if (view === 'resourceTimeGridDay') return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  if (view === 'timeGridWeek') {
    const end = new Date(d); end.setDate(d.getDate() + 6)
    const s = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${s} – ${e}`
  }
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

interface Props {
  shopId: string
  shopName: string
  shopCode?: string
  openBookOnLoad?: boolean
}

export default function OwnerCalendar({ shopId, shopCode, openBookOnLoad }: Props) {
  const [view, setView] = useState<CalView>('resourceTimeGridDay')
  const [viewStart, setViewStart] = useState(new Date())
  const [appointments, setAppointments] = useState<any[]>([])
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [popover, setPopover] = useState<{ appt: any; barberName: string; x: number; y: number } | null>(null)
  const [bookSlot, setBookSlot] = useState<{ date: string; time: string; barberId?: string } | null>(null)
  const [showBook, setShowBook] = useState(openBookOnLoad || false)
  const calRef = useRef<FullCalendar>(null)
  const supabase = useMemo(() => createClient(), [])

  const loadAppointments = useCallback(async () => {
    const now = new Date()
    const past = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const future = new Date(now.getFullYear(), now.getMonth() + 4, 0)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const { data } = await supabase
      .from('appointments')
      .select('*, services(name, price)')
      .eq('shop_id', shopId)
      .gte('date', fmt(past))
      .lte('date', fmt(future))
      .order('date').order('time', { ascending: true })
    setAppointments(data || [])
  }, [shopId, supabase])

  useEffect(() => {
    async function init() {
      const [{ data: b }, { data: s }] = await Promise.all([
        supabase.from('shop_barbers').select('barber_id, barber_name, alias, joined_at').eq('shop_id', shopId).eq('active', true).order('joined_at', { ascending: true }),
        supabase.from('services').select('id, name, price').eq('shop_id', shopId).eq('active', true).order('price', { ascending: true }),
      ])
      setBarbers(b || [])
      setServices(s || [])
      await loadAppointments()
    }
    init()
  }, [shopId, supabase, loadAppointments])

  useEffect(() => {
    const channel = supabase.channel('owner-cal-appts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `shop_id=eq.${shopId}` }, loadAppointments)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [shopId, supabase, loadAppointments])

  const barberColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    barbers.forEach((b, i) => { m[b.barber_id] = BARBER_COLORS[i % BARBER_COLORS.length] })
    return m
  }, [barbers])

  const resources = useMemo(() => barbers.map((b, i) => ({
    id: b.barber_id,
    title: b.barber_name || b.alias || 'Barber',
    eventColor: BARBER_COLORS[i % BARBER_COLORS.length],
  })), [barbers])

  const fcEvents = useMemo(() => appointments.map(a => {
    const timeStr = a.time || '09:00:00'
    const color = barberColorMap[a.barber_id] || '#65655F'
    return {
      id: a.id,
      title: a.client_name || 'Unknown',
      start: `${a.date}T${timeStr}`,
      end: `${a.date}T${addMins(timeStr, 30)}`,
      resourceId: a.barber_id,
      backgroundColor: color,
      borderColor: 'transparent',
      textColor: '#ffffff',
      extendedProps: {
        ...a,
        serviceName: a.services?.name || '',
        servicePrice: a.services?.price || a.price,
      },
    }
  }), [appointments, barberColorMap])

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault()
    const appt = info.event.extendedProps
    const barberId = appt.barber_id
    const barberName = barbers.find(b => b.barber_id === barberId)?.barber_name || barbers.find(b => b.barber_id === barberId)?.alias || 'Barber'
    setPopover({ appt: { ...appt, id: info.event.id }, barberName, x: info.jsEvent.clientX, y: info.jsEvent.clientY })
  }

  function handleSelect(info: DateSelectArg) {
    const dateStr = info.startStr.split('T')[0]
    const timeStr = info.startStr.includes('T') ? info.startStr.split('T')[1].slice(0,8) : '09:00:00'
    const barberId = (info as any).resource?.id
    setBookSlot({ date: dateStr, time: timeStr, barberId })
    setShowBook(true)
    calRef.current?.getApi().unselect()
  }

  function handleDatesSet(info: DatesSetArg) {
    setViewStart(info.start)
  }

  function changeView(v: CalView) {
    setView(v)
    calRef.current?.getApi().changeView(v)
  }

  function renderEventContent(arg: EventContentArg) {
    const props = arg.event.extendedProps
    const firstName = (arg.event.title || '').split(' ')[0]
    if (arg.view.type === 'dayGridMonth') {
      return (
        <div className="flex items-center gap-0.5 px-0.5 py-px overflow-hidden">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: arg.event.backgroundColor || '#0d9488' }} />
          <span className="text-[9px] font-medium text-charcoal-900 truncate">{firstName}</span>
        </div>
      )
    }
    return (
      <div className="px-1.5 py-1 h-full overflow-hidden flex flex-col gap-0.5">
        <div className="font-semibold text-[11px] text-white leading-tight truncate">{firstName}</div>
        {props.serviceName && <div className="text-[10px] text-white/75 leading-tight truncate">{props.serviceName}</div>}
      </div>
    )
  }

  const api = calRef.current?.getApi()

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Custom Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-warm-100 border-b border-warm-200 flex-shrink-0 flex-wrap gap-y-2">

        {/* View Tabs */}
        <div className="flex gap-1 bg-warm-200 rounded-lg p-0.5">
          {([['resourceTimeGridDay','Day'],['timeGridWeek','Week'],['dayGridMonth','Month']] as [CalView,string][]).map(([v,label]) => (
            <button key={v} onClick={() => changeView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view===v ? 'bg-warm-50 text-od-green shadow-sm' : 'text-charcoal-500 hover:text-charcoal-900'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Date Nav */}
        <div className="flex items-center gap-1">
          <button onClick={() => api?.today()}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-warm-200 text-charcoal-600 hover:bg-warm-300 transition-colors">
            Today
          </button>
          <button onClick={() => api?.prev()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-charcoal-500 hover:bg-warm-200 hover:text-charcoal-900 transition-colors">
            ‹
          </button>
          <div className="min-w-[160px] text-center">
            <div className="text-sm font-semibold text-charcoal-900 leading-tight">{getDateLabel(view, viewStart)}</div>
          </div>
          <button onClick={() => api?.next()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-charcoal-500 hover:bg-warm-200 hover:text-charcoal-900 transition-colors">
            ›
          </button>
        </div>

        {/* New Booking */}
        <button
          onClick={() => { setBookSlot(null); setShowBook(true) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0d9488] hover:opacity-90 text-white text-xs font-bold rounded-xl transition-opacity">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 4v16m8-8H4"/></svg>
          New Booking
        </button>
      </div>

      {/* Calendar */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, resourceTimeGridPlugin, interactionPlugin]}
          schedulerLicenseKey={process.env.NEXT_PUBLIC_FULLCALENDAR_LICENSE || 'CC-Attribution-NonCommercial-NoDerivatives'}
          initialView="resourceTimeGridDay"
          headerToolbar={false}
          height="100%"
          resources={resources}
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
          resourceAreaWidth="12%"
          resourceAreaHeaderContent=""
          eventMinHeight={28}
          dayMaxEventRows={4}
          dateClick={(info) => {
            if (view === 'dayGridMonth') {
              calRef.current?.getApi().gotoDate(info.date)
              changeView('resourceTimeGridDay')
            }
          }}
        />
      </div>

      {/* Appointment Popover */}
      {popover && (
        <AppointmentPopover
          appointment={popover.appt}
          barberName={popover.barberName}
          x={popover.x}
          y={popover.y}
          isOwner={true}
          onClose={() => setPopover(null)}
          onUpdated={loadAppointments}
        />
      )}

      {/* Quick Book Modal */}
      {showBook && (
        <QuickBookModal
          shopId={shopId}
          initialDate={bookSlot?.date}
          initialTime={bookSlot?.time}
          initialBarberId={bookSlot?.barberId}
          barbers={barbers}
          services={services}
          onCreated={loadAppointments}
          onClose={() => { setShowBook(false); setBookSlot(null) }}
        />
      )}
    </div>
  )
}
