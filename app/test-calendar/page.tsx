'use client';

import { useMemo } from 'react';
import { IlamyResourceCalendar, CalendarEvent, Resource } from '@ilamy/calendar';
import dayjs from 'dayjs';

// Sample data mimicking ChairOS appointments
const resources: Resource[] = [
  { id: 'bear', title: 'Bear', color: '#7A8C3A' },
  { id: 'marcus', title: 'Marcus', color: '#3b82f6' },
  { id: 'jay', title: 'Jay', color: '#a855f7' },
];

function makeEvents(): CalendarEvent[] {
  const today = dayjs().startOf('day');
  return [
    {
      id: '1',
      title: 'Line-Up / Edge-Up — D. Carter',
      start: today.hour(9).minute(0),
      end: today.hour(9).minute(30),
      resourceId: 'bear',
      color: '#7A8C3A',
    },
    {
      id: '2',
      title: 'Full Cut — J. Smith',
      start: today.hour(9).minute(30),
      end: today.hour(10).minute(15),
      resourceId: 'bear',
      color: '#7A8C3A',
    },
    {
      id: '3',
      title: 'Beard Trim — M. Johnson',
      start: today.hour(10).minute(30),
      end: today.hour(11).minute(0),
      resourceId: 'marcus',
      color: '#3b82f6',
    },
    {
      id: '4',
      title: 'Hot Towel Shave — R. Davis',
      start: today.hour(11).minute(0),
      end: today.hour(11).minute(45),
      resourceId: 'jay',
      color: '#a855f7',
    },
    {
      id: '5',
      title: 'Kids Cut — T. Wilson',
      start: today.hour(13).minute(0),
      end: today.hour(13).minute(30),
      resourceId: 'bear',
      color: '#7A8C3A',
    },
  ];
}

export default function TestCalendarPage() {
  const events = useMemo(makeEvents, []);

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-bold mb-1">Calendar Spike — @ilamy/calendar</h1>
        <p className="text-sm text-neutral-500 mb-4">
          Resource view (chairs/staff as columns). This is a test page, not linked in nav.
        </p>
        <div className="h-[600px] border rounded-xl overflow-hidden">
          <IlamyResourceCalendar
            events={events}
            resources={resources}
            initialDate={dayjs()}
          />
        </div>
      </div>
    </div>
  );
}
